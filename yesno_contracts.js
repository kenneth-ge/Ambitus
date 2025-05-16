const fs = require('fs');
const path = require('path');
const { Heap } = require('heap-js');

const {
    addUser,
    enrichenUser,
    users,
    saveData: saveUserData,
    loadData: loadUserData,
} = require('./users');

const {
    formatUnixTimestamp
} = require('./utils');

// In-memory storage for users and bets
let bets = {};   
// Key: betId, 
/*Value: 
title, 
tag,
tagTitle, 
resolveDate,
verifierSource,
yesOrders: new Heap((a, b) => a.price - b.price),  // Min-heap for Yes orders
noOrders: new Heap((a, b) => b.price - a.price),   // Max-heap for No orders
contracts: []
*/

function cloneBet(oldBet){
    let ret = {}

    ret.title = oldBet.title
    ret.tag = oldBet.tag
    ret.tagTitle = oldBet.tagTitle
    ret.resolveDate = oldBet.resolveDate
    ret.humanReadableEndDate = oldBet.humanReadableEndDate
    ret.verifierSource = oldBet.verifierSource
    ret.contracts = oldBet.contracts
    
    ret.yesOrders = oldBet.yesOrders.toArray()
    ret.noOrders = oldBet.noOrders.toArray()

    return ret
}

// Path to save users and bets to a file
const betsFilePath = path.join(__dirname, 'yesno_bets.json');

// Function to load users and bets from files if they exist
function loadData() {
    try {
        if (fs.existsSync(betsFilePath)) {
            const data = fs.readFileSync(betsFilePath, 'utf8');
            console.log('load data', data)
            bets = JSON.parse(data);

            for(let key in bets){
                let yesItems = bets[key].yesOrders
                let noItems = bets[key].noOrders

                bets[key].yesOrders = new Heap((a, b) => parseInt(a.price) - parseInt(b.price)),  // Min-heap for Yes orders
                bets[key].noOrders = new Heap((a, b) => parseInt(b.price) - parseInt(a.price))
                
                bets[key].yesOrders.init(yesItems)
                bets[key].noOrders.init(noItems)
            }
        }
    } catch (err) {
        console.error('Error loading data from file:', err);
    }
}

// Function to save users and bets to files
function saveData() {
    let serialized = {}
    
    for(let key in bets){
        let oldBet = bets[key]
        let newBet = cloneBet(oldBet)

        serialized[key] = newBet
    }

    let dataToWrite = JSON.stringify(serialized, null, 2)
    console.log('writing...')
    console.log(dataToWrite)
    try {
        fs.writeFileSync(betsFilePath, dataToWrite, 'utf8');

        // Verify by reading the file right after writing
        const savedData = fs.readFileSync(betsFilePath, 'utf8');
    } catch (err) {
        console.error('Error saving data to file:', err);
    }
    saveUserData()
}

// Add a new bet
function addBet(betId, title, tag, tagTitle, resolveDate, verifierSource) {
    if (bets[betId]) {
        console.warn('[IGNORING] Already in database', bets[betId])
    }

    bets[betId] = {
        title,
        tag,
        tagTitle,
        resolveDate,
        humanReadableEndDate: formatUnixTimestamp(resolveDate),
        verifierSource,
        yesOrders: new Heap((a, b) => a.price - b.price),  // Min-heap for Yes orders
        noOrders: new Heap((a, b) => b.price - a.price),   // Max-heap for No orders
        contracts: [],
        pendingSave: false  // Flag to track if this bet needs saving
    };
}

// Batch process multiple bids at once
function addBids(bids) {
    const results = [];
    const betsToMatch = new Set();
    
    for (const bid of bids) {
        const { userId, betId, price, yesNo } = bid;
        
        // Check if the user exists
        if (!users[userId]) {
            results.push({
                success: false,
                reason: 'User not found'
            });
            continue;
        }

        // Check if the bet exists
        if (!bets[betId]) {
            results.push({
                success: false,
                reason: 'Bet not found'
            });
            continue;
        }

        const user = users[userId];
        const bet = bets[betId];

        // Ensure the user has enough balance
        if (user.balance < price) {
            results.push({
                success: false,
                reason: 'Insufficient balance'
            });
            continue;
        }

        // Create the contract
        const contract = { userId, price, yesNo, betId, createdAt: new Date() };

        // Add the contract to the user's list of bids
        user.bids.push(contract);

        // Add the contract to the appropriate queue
        if (yesNo === 'yes') {
            bet.yesOrders.push(contract);
        } else {
            bet.noOrders.push(contract);
        }

        bet.pendingSave = true;
        betsToMatch.add(betId);
        results.push({ success: true });
    }

    // Match orders for all affected bets
    for (const betId of betsToMatch) {
        matchOrders(betId);
    }

    // Only save if there were any successful operations
    if (results.some(r => r.success)) {
        saveData();
    }

    return results;
}

// Match orders for a bet - optimized version
function matchOrders(betId) {
    const bet = bets[betId];
    if (!bet) return;

    const matches = [];
    const yesOrders = [];
    const noOrders = [];

    // Collect all possible matches first
    while (bet.yesOrders.size() > 0 && bet.noOrders.size() > 0) {
        const bestYes = bet.yesOrders.peek();
        const bestNo = bet.noOrders.peek();

        if (parseInt(bestYes.price) + parseInt(bestNo.price) >= 100) {
            matches.push({ yes: bestYes, no: bestNo });
            yesOrders.push(bet.yesOrders.pop());
            noOrders.push(bet.noOrders.pop());
        } else {
            break;
        }
    }

    // Process all matches in batch
    for (const match of matches) {
        const { yes, no } = match;
        
        // Update user balances
        users[yes.userId].balance -= yes.price;
        users[no.userId].balance -= no.price;

        // Update user contracts
        users[yes.userId].bids = users[yes.userId].bids.filter(item => item !== yes);
        users[no.userId].bids = users[no.userId].bids.filter(item => item !== no);

        users[yes.userId].boughtContracts.push(yes);
        users[no.userId].boughtContracts.push(no);

        // Add to completed contracts
        bet.contracts.push(yes, no);
    }
}

// Debounced save function to prevent too frequent writes
let saveTimeout = null;
function debouncedSave() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
        saveData();
    }, 1000); // Save after 1 second of inactivity
}

// Modified saveData to only save changed bets
function saveData() {
    let serialized = {};
    let hasChanges = false;
    
    for (let key in bets) {
        if (bets[key].pendingSave) {
            let oldBet = bets[key];
            let newBet = cloneBet(oldBet);
            serialized[key] = newBet;
            bets[key].pendingSave = false;
            hasChanges = true;
        }
    }

    if (hasChanges) {
        try {
            const dataToWrite = JSON.stringify(serialized, null, 2);
            fs.writeFileSync(betsFilePath, dataToWrite, 'utf8');
            saveUserData();
        } catch (err) {
            console.error('Error saving data to file:', err);
        }
    }
}

// Get a line chart
function getLineChart(betId) {
    const bet = bets[betId];
    const history = [];

    if (!bet) {
        console.log('Bet not found');
        return history;
    }

    // Combine prices from both yes and no queues
    // show the yes price for the line chart
    bet.contracts.forEach(contract => {
        let price = contract.price

        if(contract.yesNo === 'no'){
            price = 100 - price
        }

        history.push(price);
    });

    return history;
}

/*
Value: 
title, 
tag,
tagTitle, 
resolveDate,
verifierSource,
yesOrders: new Heap((a, b) => a.price - b.price),  // Min-heap for Yes orders
noOrders: new Heap((a, b) => b.price - a.price),   // Max-heap for No orders
contracts: []
*/
function getYesNoBets(){
    returnBets = {}

    for (let key in bets) {
        let newBet = cloneBet(bets[key])
        
        console.log('stuff', newBet, [key])

        let lastContract = newBet.contracts.at(-1)
        let penultimateContract = newBet.contracts.at(-2)
        
        // Default values if no contracts exist
        let lastYesPrice = "82"
        let lastNoPrice = "28"
        
        if (lastContract) {
            if (lastContract.yesNo === 'yes') {
                lastYesPrice = lastContract.price
                lastNoPrice = penultimateContract ? penultimateContract.price : "28"
            } else {
                lastNoPrice = lastContract.price
                lastYesPrice = penultimateContract ? penultimateContract.price : "82"
            }
        }

        newBet.yesprob = lastYesPrice
        newBet.noprob = lastNoPrice

        newBet.yesprice = !(bets[key].yesOrders.peek()) ? 82 : parseInt(bets[key].yesOrders.peek().price)
        newBet.noprice = !(bets[key].noOrders.peek()) ? 82 : parseInt(bets[key].noOrders.peek().price)

        returnBets[key] = newBet
    }

    return returnBets
}

// Load data when starting the app
loadData();

module.exports = {
    addBet,
    addBids,  // New batch processing function
    matchOrders,
    getLineChart,
    saveData,
    loadData,
    getYesNoBets
};
