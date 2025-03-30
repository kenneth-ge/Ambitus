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
/* 
 * title,
 * tag,
 * resolveDate,
 * verifierSource,
 * seedPrice,
 * range,
 * contracts: []
 */
let bets = {};

// Path to save users and bets to a file
const betsFilePath = path.join(__dirname, 'blind_bets.json');

// Function to load users and bets from files if they exist
function loadData() {
    try {
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
        fs.writeFileSync(betsFilePath, JSON.stringify(bets, null, 2), 'utf8');
        console.log('Users and Bets data saved to file');
    } catch (err) {
        console.error('Error saving data to file:', err);
    }
    saveUserData()
}

// Add a new bet
function addBet(betId, title, tag, tagTitle, resolveDate, verifierSource, seedPrice, range) {
    bets[betId] = {
        title,
        tag,
        tagTitle,
        resolveDate,
        verifierSource,
        seedPrice,
        range,
        contracts: []
    };
    saveData();

    return {
        success: true
    }
}

// Add a contract to a bet
function addContract(userId, betId, numContracts, guessValue) {
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
    let price = bet.seedPrice * numContracts
    if (user.balance < price) {
        console.log('Insufficient balance');
        return {
            success: false,
            reason: 'Insufficient balance'
        };
    }

    // Create the contract
    const contract = { userId, price, numContracts, guessValue, betId, createdAt: new Date() };

    // Add the contract to the user's list of bids
    user.boughtContracts.push(contract);

    // Add the contract to the appropriate list
    bet.contracts.push(contract)

    // subtract cost from user's balance
    user.balance -= price

    // Save data
    saveData();

    console.log('Success!')
    return {
        success: true
    }
}

// Get a histogram chart
function getHistogramChart(betId, obfuscate=true) {
    // in order to hide any info and prevent
    // leakage, we present only a distribution shape
    // we do this by scaling mean to 0 and range to 1000
    const bet = bets[betId];

    if (!bet) {
        console.log('Bet not found');
        return history;
    }

    let values = []

    // Get values
    bet.contracts.forEach(contract => {
        let value = contract.guessValue
        let number = contract.numContracts

        values.push({
            value,
            frequency: number
        });
    });

    let scaledValues = values
    if(obfuscate){
        // rescale mean to 0 and range to 1000
        // Step 1: Calculate the weighted mean
        const totalSum = values.reduce((sum, { value, frequency }) => sum + value * frequency, 0);
        const totalNum = values.reduce((sum, { frequency }) => sum + frequency, 0);

        const mean = totalSum / totalNum;

        // Step 2: Center the values around the mean
        const centeredValues = values.map(({ value, frequency }) => ({ 
            value: value - mean, 
            frequency 
        }));

        // Step 3: Calculate the range (max - min) of the centered values
        const min = Math.min(...centeredValues.map(({ value }) => value));
        const max = Math.max(...centeredValues.map(({ value }) => value));
        const range = max - min;

        // Step 4: Rescale the values so that the range is 1000
        scaledValues = centeredValues.map(({ value, frequency }) => ({
            value: (value - min) * 1000 / range,
            frequency
        }));
    }

    return scaledValues;
}

function logisticScoring(guess, trueValue, k = 0.2, d = 10) {
    return 1 / (1 + Math.exp(k * (Math.abs(guess - trueValue) - d)));
}

function calculatePayouts(guesses, trueValue, prizePool, k = 0.2, d = 10) {
    // Step 1: Compute weighted scores
    let weightedScores = guesses.map(({ value, number, userId }) => {
        let score = logisticScoring(value, trueValue, k, d);
        return { userId, weightedScore: score * number };
    });

    // Step 2: Compute total weighted score
    let totalWeightedScore = weightedScores.reduce((sum, { weightedScore }) => sum + weightedScore, 0);

    // Step 3: Compute payouts
    let payouts = weightedScores.map(({ userId, weightedScore }) => ({
        userId,
        payout: totalWeightedScore > 0 ? (weightedScore / totalWeightedScore) * prizePool : 0
    }));

    return payouts;
}

function resolveBet(betId, trueValue){
    const bet = bets[betId];

    if (!bet) {
        console.log('Bet not found');
        return history;
    }

    let totalPool = 0
    let values = []

    // Get values
    bet.contracts.forEach(contract => {
        let value = contract.guessValue
        let number = contract.numContracts

        totalPool += contract.price

        values.push({
            value,
            number,
            userId: contract.userId
        });
    });

    let payouts = calculatePayouts(values, trueValue, totalPool)

    payouts.forEach(({ userId, payout }) => {
        console.log(`User ${userId} receives $${payout.toFixed(2)}`);
        enrichenUser(userId, payout)
    });    
}

function getBets(){
    let ret = structuredClone(bets)

    for (let key in bets) {
        ret[key].contracts = []
        ret[key].humanReadableEndDate = formatUnixTimestamp(ret[key].resolveDate)
    }

    return ret;
}

// Load data when starting the app
loadData();

module.exports = {
    addBet,
    addContract,
    getHistogramChart,
    resolveBet,
    saveData,
    loadData,
    getBets
};
