const fs = require('fs');
const path = require('path');
const { Heap } = require('heap-js');

/* 
    each item contains balance, bids, boughtContracts
*/
let users = {};

const usersFilePath = path.join(__dirname, 'users.json');

// Function to load users and bets from files if they exist
function loadData() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf8');
            users = JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading data from file:', err);
    }
}

// Function to save users and bets to files
function saveData() {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
        console.log('User data saved to file');
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

// load data when starting
loadData()

module.exports = {
    addUser,
    enrichenUser,
    users,
    saveData,
    loadData,
};
