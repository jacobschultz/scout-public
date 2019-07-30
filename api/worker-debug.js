//Try to load the original dotenv from the project home
require('dotenv').config();
//Setup modules to use
var schedule = require('node-schedule');
var servers = require('./models/server.js');
var devices = require('./models/device.js');
var patch = require('./models/patch.js');
var inventory = require('./models/inventory.js');
var db = require('./common/db.js');
var crypto = require('crypto'),
    algorithm = 'aes-256-ctr',
    password = process.env.ENC_KEY;
//Setup the logger to write info to the console
var winston= require('winston');
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(),winston.format.splat(), winston.format.simple()),
    transports: [
      // - Write to all logs with level `info` and below to `combined.log`
      new winston.transports.File({ filename: process.env.ROOT_DIR+'logs/error.log', level: 'error' }),
      // - Write all logs error (and below) to `error.log`.
      new winston.transports.File({ filename: process.env.ROOT_DIR+'logs/worker.log' })
    ]
});
//Get the url passed in for this server to update
var serverURL = process.argv[2];
//Check if we are updating a batch server or the mongo db
var serverType = 'limited';
if (process.argv.length > 3){
  serverType = process.argv[3];
}
//Log the args to the log file
logger.log('info', '\n===============================START UPDATE====================================');
logger.log('info', 'Server URL: %s', serverURL);
logger.log('info', 'Update Type: %s', serverType);

//Connect to the db and start updating
db.connect(function(err) {
  if (err) {
    console.log('Unable to connect to database.');
    logger.log('error', 'Unable to connect to database');
    logger.log('error', 'Error: %s', err);
    process.exit(1);
  } else {
    if (serverType == 'patch'){
      patch.handleWorkerUpdates(serverURL)
      .then(function(result){
        console.log(result.length + ' patches updated!');
      })
      .catch(function(error){
        console.log('Unable to update patches for server.');
        console.log(error);
        process.exit(1);
      });
    //Expanded records are inserted into a nosql mongo database for bulk storage
    } else if (serverType == 'expanded'){
      logger.log('info', 'Execute Directory: %s', process.cwd());
      //Connect to the NoSQL database
      db.connectNoSQL(function(err){
        if (err){
          logger.log('error', 'Unable to connect to mongodb.');
          process.exit(1);
        }
        var jss_id;
        //Get all of the devices from the database
        servers.getServerFromURL(serverURL)
        .then(function(serverDetails){
          jss_id = serverDetails[0].id;
          return inventory.getFullInventory(serverURL,serverDetails[0].username, db.decryptString(serverDetails[0].password), serverDetails[0].id)
        })
        .then(function(fullApiDevices){
          //After getting all of the devices from the jss insert them //deviceObj.id, jss_id)
          Promise.all(fullApiDevices.map(deviceObj => devices.upsertFullInventory(deviceObj, jss_id))).then(function(results){
            logger.log('info', 'Inserted %d expanded inventories', results.length);
            logger.log('info', '===============================FINISH UPDATE====================================\n');
            //Mongo should auto handle closing the connection, but just to safe, close it here
            var killMongoResult = db.closeMongoConnection();
            console.log('Closed Mongo Connection? ' + killMongoResult);
            process.exit(0);
          })
          .catch(error => {
            logger.log('error', 'Unable to insert all expanded inventories');
            logger.log('error', error);
            console.log(error);
            var killMongoResult = db.closeMongoConnection();
            process.exit(1);
          });
        })
        .catch(error => {
          logger.log('error', 'Unable to insert all expanded inventories');
          logger.log('error', error);
          console.log(error);
          var killMongoResult = db.closeMongoConnection();
          process.exit(1);
        });
      });
    } else if (serverType == 'limited'){
      logger.log('info', 'Execute Directory: %s', process.cwd());
      console.log('Getting inventory for: ' + serverURL);
      logger.log('info', 'Getting all devices for %s', serverURL);
      var serverId;
      //Get the server details from the database
      servers.getServerFromURL(serverURL)
      .then(function(serverDetails){
        //get all of the devices for that server
        serverId = serverDetails[0].id;
        servers.getAllDevices(serverURL, serverDetails[0].id, serverDetails[0].username, db.decryptString(serverDetails[0].password))
        .then(function(allDevicesList){
          console.log('Got ' + allDevicesList.length + ' from the JPS API.');
          //Update each device in the database
          Promise.all(allDevicesList.map(deviceData => devices.upsertDevice(deviceData))).then(function(result){
            console.log('Updated: ' + result.length + ' devices in scout.');
            logger.log('info', '%d devices have been updated in the databse.', result.length);
            //Update the ScoutAdmin user's password to a new string
              if (!process.env.DISABLE_SCOUT_ADMIN_USER || process.env.DISABLE_SCOUT_ADMIN_USER == "false"){
                servers.updateScoutAdminUserPassword(serverURL)
                .then(function(result){
                  logger.log('info', 'ScoutAdmin user password has been updated for: ' + serverURL + ' Was new insert? ' + result.is_insert);
                  process.exit(1);
                })
                .catch(function(error){
                  logger.log('error', 'Error updating Scout Admin User for: ' + serverURL + ' Removing the user from the Jamf Pro Server. It will be readded next run.');
                  servers.wipeScoutAdminUser(serverURL)
                  .then(wipeResult => {
                    logger.log('error', 'Successfully deleted scout admin user from both Jamf Pro and the Scout Database on the server: ' + serverURL);
                    process.exit(1);
                  })
                  .catch(wipeErr => {
                    logger.log('error', 'Unable to delete ScoutAdmin user from Jamf Pro or the scout database. Please manually delete the user from Jamf Pro and remove the details from the `scout_admin_id` column in the databse for this server.');
                    process.exit(0);
                  });
                });
              } else {
                process.exit(1);
              }
          })
          .catch(function(error){
          	console.log(error);
            logger.log('error', 'Error inserting devices: %s', error);
            process.exit(0);
          });
        })
        .catch(function(error){
          console.log(error);
          logger.log('error', 'Error getting devices: %s', error);
          process.exit(0);
        });
      })
      .catch(function(error){
        console.log(error);
        logger.log('error', 'Error getting server from database: %s', error);
        process.exit(0);
      });
    }
  }
});
