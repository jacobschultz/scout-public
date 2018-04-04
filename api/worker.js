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
//Get the url passed in for this server to update
var serverURL = process.argv[2];
//check if it's a patch server that is updating
var isPatch = false;
if (process.argv.length > 3){
  isPatch = process.argv[3];
}
//Connect to the db and start updating
db.connect(function(err) {
  if (err) {
    console.log('Unable to connect to database.');
    process.exit(1);
  } else {
    if (isPatch){
      console.log('Getting all patches for: ' + serverURL);
      patch.getAllPatchesFromServer(serverURL)
      .then(function(patches){
        var objList = JSON.parse(JSON.stringify(patches));
        Promise.all(objList.map(p => patch.writePatchFromServer(serverURL,p.id))).then(function(result){
          console.log(result.length + ' patches written to files');
          process.exit(0);
        });
      })
      .catch(function(error){
        console.log(error);
        console.log('Unable to get patches from server');
        process.exit(1);
      });
    } else {
      console.log('Getting all devices for: ' + serverURL);
      //Get the server details from the database
      servers.getServerFromURL(serverURL)
      .then(function(serverDetails){
        //get all of the devices for that server
        servers.getAllDevices(serverURL, serverDetails[0].id, serverDetails[0].username, db.decryptString(serverDetails[0].password))
        .then(function(allDevicesList){
          //Update each device in the database
          Promise.all(allDevicesList.map(deviceData => devices.upsertDevice(deviceData))).then(function(result){
            console.log(result.length + ' devices updated in the database');
            //Check for expanded inventory Devices
            var expandedInventoryDevices = [];
            allDevicesList.forEach(function(d) {
              if (d.expanded_inventory == true || d.expanded_inventory == 1){
                expandedInventoryDevices.push(d);
              }
            });
            //Update exapnded inventory devices
            console.log(expandedInventoryDevices.length + ' expanded inventory devices will be updated');
            if (expandedInventoryDevices.length > 0){
              //Call the API for each device to update them
              Promise.all(expandedInventoryDevices.map(device => devices.getExpandedInventory(serverURL,serverDetails[0].username, db.decryptString(serverDetails[0].password),device))).then(function(results){
                //Build a record for each of the devices to insert
                Promise.all(results.map(jssResponse => inventory.buildExpandedInventoryRecord(jssResponse))).then(function(inventoryRecords){
                  //insert to the database
                  Promise.all(inventoryRecords.map(record => inventory.insertInventoryRecords(record))).then(function(results){
                    process.exit(0);
                  })
                  .catch(function(error){
                    console.log('Error Inserting Expanded Inventory');
                    console.log(error);
                    process.exit(1);
                  });
                })
                .catch(function(error){
                  console.log('Error Building Expanded Inventory');
                  console.log(error);
                  process.exit(1);
                });
              })
              .catch(function(error){
                console.log('Error Inserting Devices');
                console.log(error);
                process.exit(1);
              });
            } else {
              process.exit(0);
            }
          })
          .catch(function(error){
            console.log('Error Inserting Devices');
            console.log(error);
            process.exit(1);
          });
        })
        .catch(function(error){
          console.log('Error Getting Devices');
          console.log(error);
          process.exit(1);
        });
      })
      .catch(function(error){
        console.log('Error Getting Server from Database');
        console.log(error);
        process.exit(1);
      });
    }
  }
});
