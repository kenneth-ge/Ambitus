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

                bets[key].yesOrders = new Heap((a, b) => a.price - b.price),  // Min-heap for Yes orders
                bets[key].noOrders = new Heap((a, b) => b.price - a.price)
                
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
        contracts: []
    };
    saveData();
}

// Add a contract to a bet
function addBid(userId, betId, price, yesNo) {
    // Check if the user exists
    if (!users[userId]) {
        console.log('User not found')
        return {
            success: false,
            reason: 'User not found'
        }
    }

    // Check if the bet exists
    if (!bets[betId]) {
        console.log('Bet not found')
        return {
            success: false,
            reason: 'Bet not found'
        };
    }

    const user = users[userId];
    const bet = bets[betId];

    // Ensure the user has enough balance
    if (user.balance < price) {
        console.log('Insufficient balance');
        return {
            success: false,
            reason: 'Insufficient balance'
        };
    }

    // Create the contract
    const contract = { userId, price, yesNo, betId, createdAt: new Date() };

    // Add the contract to the user's list of bids
    user.bids.push(contract);

    // console.log(Object.getPrototypeOf(bet.yesOrders))
    // console.log(Object.getPrototypeOf(bet.noOrders))
    // console.log(Object.getPrototypeOf(new Heap()))

    // Add the contract to the appropriate queue based on whether it's 'yes' or 'no'
    if (yesNo === 'yes') {
        bet.yesOrders.push(contract);  // Add to yes queue
    } else {
        bet.noOrders.push(contract);   // Add to no queue
    }

    console.log('add bet orders and stuff')
    console.log(bet.yesOrders, bet.noOrders)

    // match orders if possible
    matchOrders(betId)

    // Save data
    saveData();

    console.log('Success!')
    return {
        success: true
    }
}

// Match orders for a bet
function matchOrders(betId) {
    const bet = bets[betId];

    if (!bet) {
        console.log('Bet not found');
        return;
    }

    while (bet.yesOrders.size() > 0 && bet.noOrders.size() > 0) {
        const bestYes = bet.yesOrders.peek();  // Get the best (lowest) yes price
        const bestNo = bet.noOrders.peek();   // Get the best (highest) no price

        // If the best yes price and the bet no price add up to >= 1, a match is possible
        if (bestYes.price + bestNo.price >= 1) {
            // Perform transaction logic here, such as updating user balances or removing matched orders
            console.log('Matching Orders for Bet:', bestYes, bestNo);

            // Deduct the amount from the user's balance
            users[bestYes.userId].balance -= bestYes.price;
            users[bestNo.userId].balance -= bestNo.price;

            // Move from user's bids to user's bought contracts
            users[bestYes.userId].bids = users[bestYes.userId].bids.filter(item => item !== bestYes);
            users[bestNo.userId].bids = users[bestNo.userId].bids.filter(item => item !== bestNo);

            users[bestYes.userId].boughtContracts.push(bestYes)
            users[bestNo.userId].boughtContracts.push(bestNo)

            // add the contracts to the list of completed  bets
            bets[betId].contracts.push(bestYes)
            bets[betId].contracts.push(bestNo)

            // Remove matched orders from the queues
            bet.yesOrders.pop();
            bet.noOrders.pop();
        } else {
            break;  // No more possible matches
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
    allOrders.forEach(contract => {
        let price = contract.price

        if(contracts.yesNo === 'no'){
            price = 100 - price
        }

        history.push(price);
    });

    return histogram;
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
        let lastYesPrice = lastContract.yesNo == 'yes' ? lastContract.price : penultimateContract.price
        let lastNoPrice = lastContract.yesNo == 'no' ? lastContract.price : penultimateContract.price

        newBet.yesprob = lastYesPrice
        newBet.noprob = lastNoPrice

        newBet.yesprice = bets[key].yesOrders.peek()
        newBet.noprice = 100 - bets[key].noOrders.peek()

        returnBets[key] = newBet
    }

    return returnBets
}

// Load data when starting the app
loadData();

module.exports = {
    addBet,
    addBid,
    matchOrders,
    getLineChart,
    saveData,
    loadData,
    getYesNoBets
};
