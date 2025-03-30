function formatUnixTimestamp(unixTimestamp) {
    // Create a Date object from the Unix timestamp (in milliseconds)
    const date = new Date(unixTimestamp * 1000);

    // Extract components from the Date object
    const weekday = date.toLocaleString('en-US', { weekday: 'short' });
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    const year = date.getFullYear();
    let hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();

    // Format hour in 12-hour format (AM/PM)
    const amPm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;  // Convert to 12-hour format, handle '0' as '12'

    // Only show minute and second if they are not zero
    const formattedMinute = minute !== 0 ? `:${minute < 10 ? `0${minute}` : minute}` : '';
    const formattedSecond = second !== 0 ? `:${second < 10 ? `0${second}` : second}` : '';

    // Get the timezone abbreviation (e.g., ET, PST)
    const timezone = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ')[2];

    // Build the formatted date
    const formattedDate = `${weekday}, ${month} ${day}, ${year} at ${hour}${formattedMinute}${formattedSecond} ${amPm} ${timezone}`;

    return formattedDate;
}

module.exports = {
    formatUnixTimestamp
}