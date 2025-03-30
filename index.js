const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();
const port = 3000;

const {
    addBet,
    addBid: addYesNoBid,
    matchOrders,
    getLineChart,
    saveData: saveYesNoData,
    loadData: loadYesNoData,
    getYesNoBets
} = require('./yesno_contracts');

const {
    addUser,
    enrichenUser,
    users
} = require('./users');

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Set the views folder (where your .ejs files will be stored)
app.set('views', path.join(__dirname, 'views'));

// Serve static files (like CSS, JS, images, etc.) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use express-session to create a session for the user
app.use(session({
    secret: 'your-secret-key', // Secret key for signing the session ID
    resave: false,  // Don't resave the session if it wasn't modified
    saveUninitialized: true,  // Save an uninitialized session
    cookie: { secure: false }  // Set to true if using HTTPS
}));

// Fake authentication middleware
function fakeAuthMiddleware(req, res, next) {
    // Check if the user is already "logged in" (by checking the session)
    if (req.session.username) {
        console.log(`User already signed in: ${req.session.username}`);
        next();
    } else {
        console.log('No user signed in.');
        next();
    }
}

//////////////////////////////////////////////////////////////////////
/////////////////////////// AUTHENTICATION ///////////////////////////
//////////////////////////////////////////////////////////////////////

// Sign in middleware that saves username to session
function signInMiddleware(req, res, next) {
    const { username } = req.body;
    
    if (username) {
        // Save the username to the session (fake auth)
        req.session.username = username;
        console.log(`User signed in: ${username}`);
        res.json({ message: 'Signed in successfully', username });
    } else {
        res.status(400).json({ message: 'Username is required' });
    }
}

// Apply fakeAuthMiddleware to any route that needs authentication
app.use(fakeAuthMiddleware);

// Routes
app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.username
    })
})

app.get('/login', (req, res) => {
    if (req.session.username) {
        return res.redirect('/dashboard'); // Redirect if already logged in
    }
    res.render('login');
});

// Handle login (set session)
app.post('/login', (req, res) => {
    const { username } = req.body;

    if (username) {
        // Save the username to the session
        req.session.username = username;
        console.log(`User signed in: ${username}`);
        
        addUser(username)

        // Redirect to the root ("/") page
        res.redirect('/');
    } else {
        res.status(400).json({ message: 'Username is required' });
    }
});

// Handle logout (destroy session)
app.get('/logout', (req, res) => {
    res.clearCookie('session'); // Remove session cookie (modify based on your auth system)
    req.session.username = null; // If using express-session, destroy session
    res.redirect('/'); // Redirect to home after logout
});

//////////////////////////////////////////////////////////////////////
/////////////////////////// YES & NO PAGES ///////////////////////////
//////////////////////////////////////////////////////////////////////

app.get('/yesno', (req, res) => {
    res.render('yesno', {
        cards: getYesNoBets()
    })
})

/////////////////////////////////////////////////////////////////////
//////////////////////// USER HANDLING STUFF ////////////////////////
/////////////////////////////////////////////////////////////////////

app.get('/user/enrichen_user', (req, res) => {
    if(req.session.username)
        enrichenUser(req.session.username)
    res.status(201).json({ message: 'User enriched successfully' });
})

///////////////////////////////////////////////////////////////////////
//////////////////////// YES/NO CONTRACT STUFF ////////////////////////
///////////////////////////////////////////////////////////////////////

app.post('/yesno/addBet', (req, res) => {
    const { betId, title, tag, tagTitle, resolveDate, verifierSource } = req.body;
    console.log(req.body)
    addBet(betId, title, tag, tagTitle, resolveDate, verifierSource)
    res.status(201).json({ message: 'Bet added successfully' });
})

// Route to add a new contract
app.post('/yesno/addYesNoBid', (req, res) => {
    const { userId, betId, price, yesNo } = req.body;

    if (!userId || !betId || !price || (yesNo !== 'yes' && yesNo !== 'no')) {
        return res.status(400).json({ message: 'Missing or invalid data' });
    }

    let result = addYesNoBid(userId, betId, price, yesNo);
    res.status(201).json(result);
});

// Route to get the histogram of contract prices
app.get('/yesno/linechart', (req, res) => {
    const { betId } = req.body;
    const histogram = getLineChart(betId);
    res.json({ histogram });
});

// Optionally, you can expose a route to save contracts manually (e.g., for periodic saving)
app.get('/yesno/save-contracts', (req, res) => {
    console.log('saving contracts manually...')
    saveYesNoData();
    res.json({ message: 'Contracts saved manually' });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
