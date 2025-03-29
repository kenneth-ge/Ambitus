const fs = require('fs');
const path = require('path');
const { Heap } = require('heap-js');

// In-memory storage for users and bets
let users = {};  // Key: userId, Value: { balance, contracts }
let bets = {};   // Key: betId, Value: { yesOrders: MinHeap, noOrders: MaxHeap, contracts: [] }

// Path to save users and bets to a file
const usersFilePath = path.join(__dirname, 'yesno_users.json');
const betsFilePath = path.join(__dirname, 'yesno_bets.json');

// Function to load users and bets from files if they exist
function loadData() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf8');
            users = JSON.parse(data);
        }
        if (fs.existsSync(betsFilePath)) {
            const data = fs.readFileSync(betsFilePath, 'utf8');
            bets = JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading data from file:', err);
    }
}

// Function to save users and bets to files
function saveData() {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
        fs.writeFileSync(betsFilePath, JSON.stringify(bets, null, 2), 'utf8');
        console.log('Users and Bets data saved to file');
    } catch (err) {
        console.error('Error saving data to file:', err);
    }
}

// Add a user to the system
function addUser(userId, initialBalance = 1000) {
    if (!users[userId]) {
        users[userId] = {
            balance: initialBalance,
            bids: [], // stores current bids
            boughtContracts: [],  // Stores contracts bought by this user
        };
        saveData();
    }
}

function enrichenUser(userId, addAmount = 1000) {
    users[userId].balance += addAmount
    saveData();
}

// Add a new bet
function addBet(betId, title, tag, resolveDate, verifierSource) {
    if (!bets[betId]) {
        bets[betId] = {
            title,
            tag,
            resolveDate,
            verifierSource,
            yesOrders: new Heap((a, b) => a.price - b.price),  // Min-heap for Yes orders
            noOrders: new Heap((a, b) => b.price - a.price),   // Max-heap for No orders
            contracts: []
        };
        saveData();
    }
}

// Add a contract to a bet
function addContract(userId, betId, price, yesNo) {
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

    // Add the contract to the appropriate queue based on whether it's 'yes' or 'no'
    if (yesNo === 'yes') {
        bet.yesOrders.push(contract);  // Add to yes queue
    } else {
        bet.noOrders.push(contract);   // Add to no queue
    }

    // don't update contracts yet here because that only stores bets that
    // have already been made

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
            price = 1 - price
        }

        history.push(price);
    });

    return histogram;
}

// Load data when starting the app
loadData();

module.exports = {
    addUser,
    enrichenUser,
    addBet,
    addContract,
    matchOrders,
    getLineChart,
    saveData,
    loadData,
};
