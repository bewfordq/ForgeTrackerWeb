## Hypixel SkyBlock Forge Tracker (Web Version)

You do not need to download or install any files to use this tool. It is hosted as a live website.

For any issues with the website message me on any of my socials.

https://bewford.gay/
1. Access the website

Go to: https://bewfordq.github.io/ForgeTrackerWeb/
2. Configuration

    Category & Item: Select the item you wish to forge from the dropdown menus.

    Quantity: Input the number of items (1-7).

    Quick Forge: ONLY WORKS CORRECTLY WITH MAX LEVEL PERK. Enable this checkbox if you have the Heart of the Mountain perk that reduces forge time by 30%. 

    Sequential: Enable this if you are queuing multiple items in a single forge slot (items run one after another). Leave this disabled if you are using multiple forge slots simultaneously.

3. Notifications

The tool integrates with ntfy.sh to send push notifications without requiring a user account.

    You must have the ntfy app downloaded to your mobile device, this can be done from https://ntfy.sh/
    
    Check the "Send notifications" box.

    Enter a custom topic URL (e.g., https://ntfy.sh/your-topic-name).

    Subscribe to this topic using the ntfy app on your phone or desktop.

    Click Calculate Timer.

Note: The script uses the X-Delay header feature of ntfy. This sends the scheduling instruction to the ntfy server immediately. Once you click calculate, you can close the browser tab; the notification will still arrive on your device when the timer completes.
How the script works

This project was originally written as a Python desktop application using the tkinter library. It was converted into a web-based format to improve accessibility and remove the requirement for users to have Python installed on their machines. The old script can be found at https://github.com/bewfordq/ForgeTracker

    Logic: The core calculation logic (duration parsing, perk multipliers, sequential addition) was ported from Python to JavaScript.

    Styling: The interface uses Tailwind CSS via CDN to replicate the dark-mode theme of the original desktop application.

    Persistence: Unlike the Python version which required the application to remain open to track timers, the web version offloads the waiting process to the notification server.

Code

This is a side project and is open for modification. While the tool is hosted at the link above, the source code is available in this repository for anyone who wishes to modify the logic or add new items.

Technical Stack:

    HTML5

    Vanilla JavaScript (No frameworks)

    Tailwind CSS (CDN)

How to add new items:
To update the item list or add new forge recipes, you can fork this repository and edit index.html. Locate the const RAW_ITEMS array near the top of the script section. You can add new entries using the following format:
code JavaScript

    
["Category", "Item Name", "Duration String"]
// Example: ["Refining", "New Material", "4 Hours"]

  

The script automatically parses text strings like "4 Hours" or "30 Seconds" into the correct integer values.
