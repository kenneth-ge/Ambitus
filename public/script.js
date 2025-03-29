async function loginUser(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;

    const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });

    const data = await response.json();
    if (response.ok) {
        alert(`Logged in as ${data.username}`);
        window.location.href = '/dashboard'; // Redirect after login
    } else {
        alert(data.message);
    }
}

async function logoutUser() {
    const response = await fetch('/logout', { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
        alert(data.message);
        window.location.href = '/login'; // Redirect after logout
    } else {
        alert('Logout failed');
    }
}
