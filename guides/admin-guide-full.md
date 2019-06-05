# Scout Admin Guide
Scout is a web based application that can be used to aggregate devices from multiple Jamf Pro applications. It features powerful reporting features, as well as the ability to send MDM commands across multiple servers from a single pane of glass. Scout also features a fully functional patch server. It's built on a proven web stack and exposes a powerful REST API that can be used by scripts or other third party implementations. Scout is fully open source, free, and provided as is. No support or maintenance is provided. That being said, the project welcomes contributions and pull requests for new features or bug fixes.

## Server Requirements
- Ubuntu or Red Hat Server (Ubuntu Highly Recommended)
  - It's recommended that at least two servers are setup - one for the web app, and one for the databases.
- 2GB or more of Ram
- Ability to install and use Mongo, MySQL, Node
- 4GB of Disk Space (100GB Recommended)
- Internet Connection

## Technology Stack
Scout relies on various open source projects and software in order to serve the web application and perform various functions. A high level list of the stack is below.

- Backend - Node, MySQL and Mongo
  - Node is used as the REST API server. It connects to both of the Mongo and MySQL databases and handles setuping up various automated jobs on the server. It's main purpose is to serve the express based API. There is no server rendering done, the backend server only communicates with the front end using JSON. This makes is easy to hook into, or even right your own front end.
  - MySQL is the main database for the scout application. No support is provided for MSSQL or other SQL-Like databases at this time. The MySQL database stores encrypted server information, high level device details, user records and saved reports.
  - Mongo is the secondary database for the scout application. It's used to store full inventory records for the devices that are brought into scout. These full records are used for the advanced reporting features. Mongo is resource heavy, so it's recommended the Mongo server is isolated to it's own server. The scout application can technically be used without mongo, but you'll loose all advanced reporting features and just have a high level overview into device information.
- Frontend - Bootstrap, jQuery, Datatables, SBAdmin 2
  - The frontend is built on popular frameworks such as Bootstrap, jQuery and the open source theme SBAdmin 2 - with heavy customizations. Datatables are used to load device data and patches.

## Data Flow
Scout uses the Jamf Pro Classic API to gather and centralize data. The Jamf Pro API exposes endpoints like /computers or /mobiledevices to gather inventory data. The Jamf Pro servers enrolled in scout *never know that the scout application even exists*. Devices such as Computers and Mobile devices talk to Jamf Pro in a standard MDM fashion. Scout's worker (explained more below) then reaches out to the Jamf Pro Servers and gathers inventory data. This inventory data is then put in the MySQL and Mongo databases. This data is accessed by the Scout Web application. It's recommend that this app sits behind an apache server for load balancing.
![Imgur](https://i.imgur.com/O4HQpkq.png)
Jamf Pro Endpoints scout uses include:
- Users Endpoint to create a Scout Admin User
- Computer and Mobile Device endpoints for gathering inventory
- Activation Code endpoint to verify credentials are valid when entering a server
- Computer and Mobile Device command endpoints for sending MDM commands

## The Scout Worker
The scout worker program is a node script that does the heavy lifting of reaching out to Jamf Pro servers and gathering inventory data. Let's explore the two types of inventory scout gathers. Let's pretend we have a scout server with 3 Jamf Pro servers enrolled, and 100 devices in each Jamf Pro Server.
- **Limited Inventory**: Limited inventory provides basic data about devices including Name, Last Inventory Update, Managed Status, UDID and other high level details. The worker only has to make one call per server to get device data for all devices inside of that server. In a limited inventory worker run, we would make 3 API Calls to Jamf Pro to get 300 devices.
- **Expanded Inventory**: Expanded inventory gives us everything the server has to offer. This includes things like installed applications, profiles, usage details, etc. The JSON document returned from the Jamf Pro Server is dumped in it's entirety into mongo where it can then be used for advanced reporting. This uses much more resources as we have to make a call for each and every device. In our scenario above, we would have to make 303 API calls total to the three servers to get all of the device information. If we tried to send all of these commands at once, it would crash the JPS, so this is also throttled.

On the server the scout web application is setup on, whenever the server is started, it loops all of the servers in the database and creates two cron jobs for each of them. One to get expanded inventory, and one to get limited inventory. The frequency is specified by the user when adding a new server. If the server is restarted, it will verify that the cron jobs match what is in the database and update, remove or insert any cron jobs that need to be updated. It's also possible to run the worker script manually to get devices update on demand.  

```
/path/to/node /scout-dir/api/worker.js https://url.jamfcloud.com (limited|expanded)
```
The above command can be run on the server that hosts scout. You'll need to fill in the path to the node executable on your server, and wherever you have the scout directory hosted. The worker script lives in /api. After that provide the worker script two params: 1. The JPS URL and 2. whether this should be a expanded or limited update. You can verify your cron jobs are running at anytime with this command:
```
crontab -l

@daily /usr/local/bin/node ~/scout-public/api/worker.js https://url.jamfcloud.com limited #Scout-Update-https://url.jamfcloud.com
@daily /usr/local/bin/node ~/scout-public/api/worker.js https://url.jamfcloud.com expanded #Scout-Update-https://url.jamfcloud.com
```
If the web application is verifying this correctly, there should be two cron jobs for each server. Don't delete the #Scout-Update Comment as that's parsed by the application to verify jobs.
## Installing Scout
Unfortunately scout isn't as easy as a one click install, and can take a bit of setup to get running. We've included guides for installing it on both [Ubuntu](https://github.com/jacobschultz/scout-public/blob/master/production-install-info.md) and [Red Hat](https://github.com/jacobschultz/scout-public/blob/master/production-install-info-redhat.md) in the root of the github directory. These guides will walk you through setting up node, mysql, mongo and the other required server such as Apache that the node server sits behind. It also helps with setting up configuration files. **Ubuntu is the recommended server platform to use whenever possible**. There is both an installer and updater ruby script in root directory that can help you through the process after Node, MySQL and Mongo have been setup. Scout doesn't have an official 'Release Cycle', instead features are merged into the master branch when they are deemed ready. Running the updater script once every few weeks ensures you always have the lastest and greatest. *Moving forward in this guide, we'll assume you have a scout server setup and running from following the directions provided above.*
## Scout Directory Structure
 - / - The root directory stores various meta information such as github files, installers, etc.
   - /app - this is the web application directory that is served up by node
     -  /app/js/server-url.js - This should be updated whenever the server url changes for the front end application to work properly.
   - /api - where the node application lives
     - All of the models and controllers for the REST API live here
     - Node files such as package.json live here.
     - 'npm install' or 'npm start' can be run from here to start/stop the server
     - worker.js also lives here
     - .env - server variables essential to the application are hosted here and explained more below
#### Server .env Variables
```
JWT_KEY=StrongPasswordUsedToSignJWTs - Used to sign login tokens
ENC_KEY=SuperStrongKeyUsedToEncryptDatabaseInformation - Encrypt server passwords in the database
LDAP_URL= - Used for Scout LDAP Login
LDAP_STR= - Used for Scout LDAP Login
SCOUT_URL=http://localhost:3000
MYSQL_HOST=127.0.0.1 - Can be on a different server
MYSQL_USER=ScoutAdmin
MYSQL_PASS=SamplePass
MYSQL_DB=scout
REG_PIN=1234 - Used for registering users if not using LDAP
PATCH_DIR=/Users/name/scout-public/api/patches/ - JSON Files for Patches live here
ROOT_DIR=/Users/name/scout-public/api/
NODE_DIR=/usr/local/bin/node - The ABSOLUTE path to the node executable on your system
NOSQL_HOST=localhost:27017 - SHOULD be a different server than the application
NOSQL_DB=scout
NOSQL_USER=ScoutAdmin
NOSQL_PASS=MongoPass
THREAD_COUNT=6 - The amount of threads to use on the system, if not specified it will use them all
HEADER_DISPLAY_NAME=Internal
SCOUT_ADMIN_USER_NAME=ScoutAdmin
```
The server .env file is essential to running the application. Without these, scout will not even start up. Keep this file safe and don't share it around. The '.env' file must live at the root of the /api directory. The installers will help set this file up. If you need to change the databse passwords or other variables in the future - this is where to do it. You must restart the server for these to take affect. **The JWT key can be changed at will to invalidate any existing sessions. If the ENC_KEY or encryption key is changed, ALL SERVERS MUST BE RE-ENTERED.**
## The Web Application
The Scout web application is server up by the REST API and allows all of the features of scout to be used. [Here is a full album of images to get an idea what it looks like.](https://imgur.com/a/qEfd0KM)
![Add Serrver](https://i.imgur.com/fpkXYBC.png)
Along the right side you'll notice a side bar. The Servers tab allows all of the servers inside of scout to be viewed and updated. It also allows emergency server access (explained below). Picture above is the process of adding a new server to scout. You must provide a valid API User and password as well as the URL of the server. The two cron fields shown below specify how often the worker script should be run to get new inventory.

Then next three tabs are for viewing macOS, iOS and tvOS devices. You can view high level (limited) inventory in a serachable table view, build reports (more below) or send MDM commands for each of them.

#### Patch Server Features
![Patch Screenshot](https://i.imgur.com/rKGJOlF.png)
The next tab down is dedicated to patch management. While not a huge feature of scout, it is useful. Scout is able to aggregate multiple patch servers into one spot, or simply serve up custom JSON for a patch definition. All of your patches will be listed in this view. In order to use this patch server inside of Jamf Pro, scout will need to be publicy available. The patch url for scout is - enter this into jamf pro:
```
scout-url.com/patches/software
```
#### Scout Admin Settings
![Settings Screenshot](https://i.imgur.com/a7R7L9f.png)
The Settings pane is only available to scout super admins, and allows them to change things such as the .env file settings right from the Scout UI. It also allows them to give certain scout users access to various settings *if not using LDAP*.
#### User Setup, Permissions, LDAP
![LDAP Screenshot](https://i.imgur.com/wggh2hE.png)
While scout is able to hook into a LDAP server, it's recommended that the build in user system is used because this will give the admin full access to setting up user permissions. There is a users table in the database where these users are stored. All passwords are hashed and salted. Login is required to use any function of the web application. After logging in a bearer token is stored in the session storage and forwaded along to any future requests to the scout backend. Certain endpoints require additional permissions. The only endpoints that don't require auth are the webhooks and user reg/login endpoints.

In order for a new user to register and then login to Scout, they must know the 'Register Pin'. this is configured in the .env file and should only be shared with trusted admins. It's recomened this value is changed often as the admin only needs to know it once upon first sign up.
#### 'Emergency' Server Access
When a new server is added to scout, in addition to getting it's devices, a new User is created in Jamf Pro called 'ScoutAdmin'. This user is an admin that can be used in the case that JPS admin is out of town, sick or leaves the company and we need to get access to that Jamf Pro Server. This user's password is stored encrypted in the database, and updated in both the database and Jamf Pro when the worker script runs.

**If this user is deleted from Jamf Pro, or you change the password manually, you'll break the emergency access feature, as scout only knows about the last good password.** If you remove a server from scout, you'll also want to delete this server or it will cause conflicts when the server is added back into Scout. If you request emergency server access, this password is removed from the database and you'll need to run the worker script again to get a new one. You can get this access by clicking on the green key in the servers view of scout.
#### Advanced Reporting
Scout has advanced reporting features very similar to Jamf Pro, but it's more powerful because it can aggregate data from so many individual servers.
![Report Builder](https://i.imgur.com/LYG1xFC.png)
These reports can be saved and ran at a later date as well. In order for these reports to be run, scout must convert the SQL like interface into a mongo query to get the actual data. This is no small feat, and by far the most buggy portion of the scout application. We've tested many report configurations, but if you run into any results that don't seem right, open a [github issue.](https://github.com/jacobschultz/scout-public/issues)
#### Live Device View
Live Device view is available for every device that is enrolled into the scout application. It gets the devices and all of it's details live from the Jamf Pro Server using the API and then displays that information in the UI. This is helpful for debugging purposes or to get a quick window into a device. Click the blue 'eye' icon next to a device in the macOS/iOS view to load this view.
#### MDM Commands (Alpha)
MDM Commands can be very powerful and can do things like wiping devices or locking them down. Before using these features in scout it's important to consider the ramifications or the ability to send commands to potentially thousands of devices across many Jamf Pro Servers that may have different policies in place. **These features are currently in alpha and should not be used against production devices**.

In order to send MDM commands, navigate to the macOS or iOS limited device view and start selecting devices in the table. A button for 'Send MDM Commands' will appear. Clicking this button will take you to a list of commands. After confirming the command to be sent, this command will be sent out to all of the JPS's of the devices in the list provided. It may take several seconds to a minute to run this process.

#### Webhooks
Scout supports the JPS Webhooks feature for just in time updates. This means whenever an event is fired inside of Jamf Pro, it will make a call to scout. Scout will then take action on that event. You'll need to create a new webhook event for each one you'd like scout to respond to. The currently supported events are: MobileDeviceEnrolled','ComputerAdded','ComputerCheckIn','ComputerInventoryComplete', 'ComputerPolicyFinished','ComputerPushCapabilityChanged', 'MobileDeviceCommandCompleted', 'MobileDevicePushSent'

![Webhook](https://i.imgur.com/9j99GTI.png)
The URL for these webhooks is scout-url.com/webhooks/device/serverId. This serverId is the JSS Server Id from the scout database. This can be looked up by accessing the servers table in MySQL. This must be filled out properly for the devices to be associated correctly. *When this feature was added to scout, the JPS did not support auth on webhook endpoints, so these webhook endpoints are currently open. A Github ticket is currently open to add auth support to these endpoints.*

## Scripting Against the API
If there is a feature scout currently doesn't support, or you'd like to just extend it with additional functionality, it's very easy to create scripts against the API. First we need to login:
```
Login Request:
POST scout-url.com/users/login/basic
BODY: { email : 'user@test.com', 'password' : 'scout'}
```
You'll get a response with various user details, as well as a 'token'. This token should be forwarded along on any future requests. For example, if I wanted to script adding new servers, my request would look something like this:
```
Adding a new Server:
POST: scout-url.com/servers/add
HEADER: Authorization: Bearer TOKEN_HERE
BODY: {'url' : 'jamfcloud.com', 'username' : 'jamf', 'password' : 'j', 'cronLimited' : '* * * * *', 'cronExpanded' : '* * * * *'};
```

The API is *not fully documented yet*. We are working on adding swagger docs for all available endpoints, but the process is taking time. Some endpoints are already documented and can be accessed at:
> scout-url.com/api-docs

If your interested in using an endpoint that isn't currently documented, it's still easy to discover what's available. Navigate to the api/controllers/ directory and checkout the different controller.js files there.
## Troubleshooting
Scout is a very complex application, and it's likely some hurdles will be encountered during it's use. The first place to start looking is the logs directory.
#### Logging and Debugging
Various parts of the scout application output log information to two main logs. The worker especially creates logs for every single run. If the directory 'logs' doesn't already exist in the /api directory, create it and then logs will start to be created. There are two main logs files error.log and worker.log. Worker contains all outputs for worker runs and can be useful in finding errors with that process. It can also be used to verify that the cron jobs are actually running. Error.log contains other server related connection issues. More information will be coming to logs soon.

#### ScoutAdmin User
The ScoutAdmin user is one of the most fragile parts of the entire scout application because of outside factors. If the connection between scout and this user breaks down, you'll see this in the worker log. To fix it, log in to the JSS that is having difficulties. Delete the ScoutAdmin user completely from the JPS. Now back in scout, find the row in the servers table that releates to the server that is having issues. Delete the values in the scout_admin_user_id and scout_admin_user_password columns. This will trigger scout to insert a new ScoutAdmin user next time the worker runs.

#### Reporting Issues
As mentioned above, the Reporting section of scout is by far the most complex. Converting reports to accurate mongo queries is very difficult. The more this feature is used, the better it will get as more eyes and query types are tried. That being said, you may find you've created a report that doesn't seem to be pulling back the proper information.

To debug this issues, start by opening the web console in your browser and running a report. The response from the report endpoints includes the generated mongo query. Verify this query is structured properly. Login to your mongo server and run it there manually and see what you get for results. After trying these results, if the query generated seems off, please submit a github issue.

#### Backing Up

#### More Soon!

## Contributing
Scout is meant to be an open source and collaborative project. We welcome pull requests for bug fixes and new features. The recommended process for this is as follows:
1. Clone the repo and get scout up and running
2. Create and checkout a new branch for your development
3. Commit changes to your develop branch. Test throughly.
4. Submit a pull request to master from your develop branch and it will be approved or denied based on code quality, compatibility, etc.


[Scout licensing information can be found here.](https://github.com/jacobschultz/scout-public/blob/master/LICENSE)
