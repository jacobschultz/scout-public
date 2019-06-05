# scout
Scout is a web based application that can be used to aggregate devices from multiple Jamf Pro servers. It features powerful reporting features, as well as the ability to send MDM commands across multiple servers from a single pane of glass. Scout also features a fully functional patch server. It's built on a proven web stack and exposes a powerful REST API that can be used by scripts or other third party implementations. Scout is fully open source, free, and provided as is. **No support or maintenance is provided.** That being said, the project welcomes contributions and pull requests for new features or bug fixes.

- [Some screenshots can be found here](https://imgur.com/a/qEfd0KM)
- [Everyone should start here with the full admin guide!](https://github.com/jamf/scout-public/blob/master/guides/admin-guide-full.md)

A full read through of the admin guide is recommended for all users, maintainers and contributors of scout. It will help to explain the flow of data from Jamf Pro into scout, the architecture of the application, and helpful debugging steps.

Full installation guides can be found in the `/guides` directory for multiple platforms. All of the frontend code lives in the `/app` directory, and the rest api server code is in the`/api` directory.  

API Docs can be found for the application after installation by navigating to https://scouturl.com/api-docs. These are fully interactive swagger docs where the REST endpoints can also be tried out. Endpoints exposed by scout include things like `/devices` or `/servers` to get lists of devices and servers contained inside of scout. Anything you can do in the UI, there is a REST Endpoint for. 
 ___

# Technology Stack

 Scout relies on various open source projects and software in order to serve the web application and perform various functions. A high level list of the stack is below.

 - Backend - Node, MySQL and Mongo
   - Node is used as the REST API server. It connects to both of the Mongo and MySQL databases and handles setuping up various automated jobs on the server. It's main purpose is to serve the express based API. There is no server rendering done, the backend server only communicates with the front end using JSON. This makes is easy to hook into, or even right your own front end.
   - MySQL is the main database for the scout application. No support is provided for MSSQL or other SQL-Like databases at this time. The MySQL database stores encrypted server information, high level device details, user records and saved reports.
   - Mongo is the secondary database for the scout application. It's used to store full inventory records for the devices that are brought into scout. These full records are used for the advanced reporting features. Mongo is resource heavy, so it's recommended the Mongo server is isolated to it's own server. The scout application can technically be used without mongo, but you'll loose all advanced reporting features and just have a high level overview into device information.
 - Frontend - Bootstrap, jQuery, Datatables, SBAdmin 2
   - The frontend is built on popular frameworks such as Bootstrap, jQuery and the open source theme SBAdmin 2 - with heavy customizations. Datatables are used to load device data and patches.
 ___

# Contributing to Scout
1. If an issue doesn't already exist for what you would like to work on, please create it. Tag it with the approiate tag such as `bug` or `enhancement`.
2. Assign yourself to any ticket you'll be working on, and create a new branch exclusively for that issue.
3. Work on your branch and commit whenever you have a workable piece of code. After everything has been fully tested, submit a Pull Request to master and add the `Scout Maintainers` group as a reviewer. They'll need to approve your pull request.
 - If master is updated while your PR is open, pull any changes back in to avoid conflicts
4. Delete your branch when you are done with it.

# Webhook Setup
Scout now supports just in time updates for use with webhooks in the JPS. To set them up you'll need to navigate to Settings -> Global and add a new webhook for each event you would like to listen for. The URL to enter in the JPS is:

- http://scouturl:3000/webhooks/(devices/servers)/JSSID

You can find the JSSId in the database table. This is required to properly link devices to the server they are in. The supported commands are:

- Add a new device : MobileDeviceEnrolled, ComputerAdded

- Update existing : ComputerCheckIn, ComputerInventoryComplete, ComputerPolicyFinished, ComputerPushCapabilityChanged,  MobileDeviceCommandCompleted, MobileDevicePushSent

- Archive Existing : MobileDeviceUnenrolled

# Complete Step by Step Installation (This is what the installer does)

1. Clone or download the repository
2. Install node.js and npm on either ubuntu (recommended) or red hat
3. Install MySQL and create the scout database. Import the scout.sql file.
4. Install Mongo or find a host for it - the scout db will be automatically created
5. In the /api directory run 'npm install'. This will install all of the web server's dependencies.
6. In the root of the /api directory create a new .env file. (touch .env)
7. Use the sample.env file to populate your settings.
8. Navigate to /app/js and create a new file called 'server-url.js'.
9. Add a single line to the server-url.js file of 'window.server_host = "http://localhost:3000";' (or whatever else you set the host to, it must match the .env file)
10. In the root of the /api directory run 'npm start' to start your server. This will need to remain running.
12. Optional: Add webhoooks to your JPS (Described above)
13. Recommended: Set this up as a production server by adding a HTTPS cert, and proxy the connection behind an Apache server using a reverse proxy


# Software Used
 - node.js, mysql, mongo and express for the server
 - SBAdmin2, jQuery and jQuery Cron for the front end
