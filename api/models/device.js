var db = require('../common/db.js');
var inventory = require('./inventory.js');
var https = require('https');
var axios = require('axios')
var server = require('./server.js');
//Allow self signed certs
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
});
var Throttle = require('promise-parallel-throttle');
//Feel free to edit this if your server has low availablity
const jpsMaxConnections = 3;
var xml2js = require('xml2js');
var winston = require('winston');
require('dotenv').config();

exports.upsertDevice = function(deviceData){
  return new Promise(function(resolve,reject) {
    const logger = winston.createLogger({
        level: 'debug',
        format: winston.format.combine(winston.format.timestamp(),winston.format.splat(), winston.format.simple()),
        transports: [
          new winston.transports.File({ filename: process.env.ROOT_DIR+'logs/sync.log' })
        ]
    });
    if (process.env.DEBUG_LOGGING) {
      logger.log('debug', 'Upserting device by UDID: %s, Serial Number: %s', deviceData.jss_udid, deviceData.jss_serial);
    }
    //Try to get the device first
    exports.getDeviceByUDID(deviceData.jss_udid)
    .then(function(results) {
      if (process.env.DEBUG_LOGGING) {
        logger.log('debug', 'Found %s devices by UDID: %s', results.length, deviceData.jss_udid);
      }
      //If it exists, update it, else insert new device
      if (results.length == 0){
        exports.insertNewDevice(deviceData)
        .then(function(data){
          if (process.env.DEBUG_LOGGING) {
            logger.log('debug', 'Inserted new device with UDID: %s, new device Id: %s', deviceData.jss_udid, data.insertId);
          }
          logger.end();
          resolve(data.insertId);
        })
        .catch(error => {
          logger.end();
          reject(error);
        });
      } else {
        if (process.env.DEBUG_LOGGING) {
          logger.log('debug', 'Updating device by UDID: %s', deviceData.jss_udid);
          logger.end();
        }
        exports.updateDevice(deviceData, deviceData.jss_id, deviceData.device_type)
        .then(function(data){
          resolve(results[0].id);
        })
        .catch(error => {
          reject(error);
        });
      }
    })
    .catch(error => {
      reject(error);
    });
  });
}

exports.getExpandedInventory = function(url, username, password, device, jssServerId) {
  return new Promise(function(resolve,reject) {
    //First translate mobile device to what the JPS API expects
    var scoutDeviceType = device.device_type;
    if (device.device_type == 'mobile' || device.device_type == 'tv'){
      device.device_type = 'mobiledevice';
    }
    //Get the device information
    axiosInstance.get(url + '/JSSResource/' + device.device_type + 's/id/'+device.jss_id, {
      auth: {
        username: username,
        password: password
      },
      headers: {'Accept': 'application/json'}
    })
    .then(function (response) {
      //add the server id to the returned object
      response.data.jss_server_id = jssServerId;
      resolve(response.data);
    })
    .catch(function (error) {
      console.log('Failed to get a device!');
      reject(error);
    });
  });
}

exports.sendMDMCommandToDeviceList = function(serverObj, commandName, options, platform){
  return new Promise(function(resolve,reject) {
    console.log(serverObj);
    var apiVerb = 'mobiledevicecommands';
    if (platform == 'computer'){
      apiVerb = 'computercommands'
    }
    //Build the xml based on the command
    var bodyObj = {};
    if (platform == 'computer'){
      bodyObj = getMDMCommandObjForComputerList(commandName,serverObj.device_list,options);
    } else {
      bodyObj = getMDMCommandObjForMobileDeviceList(commandName,serverObj.device_list,options);
    }
    console.log(bodyObj);
    var builder = new xml2js.Builder();
    var data = builder.buildObject(bodyObj);
    //Get the server details from the url
    server.getServerFromURL(serverObj.server_url)
    .then(function(serverDetails){
      //Build the request to the JPS
      var postToUrl = '';
      //Different API endpoints for computers vs. mobile devices
      if (platform == 'computer'){
        postToUrl = serverObj.server_url + '/JSSResource/'+apiVerb+'/command/'+commandName;
      } else {
        postToUrl = serverObj.server_url + '/JSSResource/'+apiVerb+'/command';
      }
        axiosInstance.post(postToUrl, data, {
          auth: {
            username: serverDetails[0].username,
            password: db.decryptString(serverDetails[0].password)
          },
          headers: {'Content-Type': 'text/xml'}
        })
        .then(function (response) {
          console.log(response.data);
          resolve(response.data);
        })
        .catch(function (error) {
          reject(error);
        });
    })
    .catch(function (error) {
      reject(error);
    });
 });

}

exports.createMDMCommand = function(url, jss_device_id, commandName){
  return new Promise(function(resolve,reject) {
  //Build the xml based on the command
  var bodyObj = getMDMCommandObj(commandName,jss_device_id);
  var builder = new xml2js.Builder();
  var data = builder.buildObject(obj);
  //Get the server details from the url
  server.getServerFromURL(url)
  .then(function(serverDetails){
    //Build the request to the JPS
      axiosInstance.post(url + '/JSSResource/mobiledevicecommands/command', data, {
        auth: {
          username: serverDetails[0].username,
          password: db.decryptString(serverDetails[0].password)
        },
        headers: {'Content-Type': 'text/xml'}
      })
      .then(function (response) {
        resolve(response.data);
      })
      .catch(function (error) {
        reject(error);
      });
  })
  .catch(function (error) {
    reject(error);
  });
 });
}

function convertDataTablesDevices(dataTablesArray){
  var newList = [];
  dataTablesArray.forEach(function(d){
    var newDevice = {};
    newDevice.jss_serial = d[3];
    newDevice.jss_udid = d[5];
    newList.push(newDevice);
  });
  return newList;
}

exports.sendMDMCommandToDevices = function(devicesList, commandName, options, platform){
  return new Promise(function(resolve,reject) {
    var convertedDevices = convertDataTablesDevices(devicesList);
    //For every device, the server for the device and some more details like the jss id
    Promise.all(convertedDevices.map(device => exports.getDeviceByUDIDAndSerial(device.jss_serial, device.jss_udid)))
    .then(function(devicesWithServers){
      //Now let's group devices by server id so we don't have to send extra API calls
      var serverList = [];
      //Loop all of if the devices with it's associated server details
      devicesWithServers.forEach(device => {
        device = device[0];
        //Check if a server object for this device already exists
        var foundServer = false;
        for (i = 0; i < serverList.length && !foundServer; i++){
          //Found a match
          if (serverList[i].server_id == device.server_id){
            serverList[i].device_list.push(device.jss_id);
            foundServer = true;
          }
        }
        //If we didn't find a match, create a new server object
        if (!foundServer){
          var s = {server_id : device.server_id, server_url : device.url, server_username : device.username, server_password : device.password};
          s.device_list = [];
          s.device_list.push(device.jss_id);
          serverList.push(s);
        }
      });
      //Now for each server, send the command's to it's devices
      Promise.all(serverList.map(s => exports.sendMDMCommandToDeviceList(s,commandName,options,platform)))
      .then(function(results){
        resolve(results);
      })
      .catch(function (error) {
        let errorObject = { url : error.config.url, req_data : error.config.data, res_data : error.response.data};
        reject(errorObject);
      });
    })
    .catch(function (error) {
      console.log(error);
      reject(error);
    });
  });
}

exports.getDeviceById = function(scoutDeviceId){
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT * FROM devices JOIN servers ON devices.server_id = servers.id WHERE devices.id = ?', [scoutDeviceId], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.getDeviceByUDIDAndSerial = function(serial, udid){
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT * FROM devices JOIN servers ON devices.server_id = servers.id WHERE devices.jss_serial = ? AND devices.jss_udid = ?', [serial, udid], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.getDeviceByUDID = function(udid) {
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT devices.*, servers.org_name FROM devices JOIN servers ON devices.server_id = servers.id WHERE devices.jss_udid = ?', [udid], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.getDeviceByUDIDAndServerId = function(udid, serverId) {
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT devices.*, servers.org_name FROM devices JOIN servers ON devices.server_id = servers.id WHERE jss_udid = ? AND server_id = ?', [udid,serverId], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.deleteDevicesByJPSId = function(jpsId){
  return new Promise(function(resolve,reject) {
    db.get().query('DELETE FROM devices WHERE server_id = ?',jpsId, function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.getAllDevices = function() {
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT devices.*, servers.org_name FROM devices JOIN servers ON devices.server_id = servers.id', function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.getDeviceByPlatform = function(platform) {
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT devices.*, servers.org_name FROM devices JOIN servers ON devices.server_id = servers.id WHERE device_type = ?', platform, function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.getDeviceWithSearch = function(platform, search) {
  return new Promise(function(resolve,reject) {
  if (search != null && search != ''){
    var wild = '%' + search + '%';
    db.get().query('SELECT devices.*, servers.org_name, servers.url FROM devices JOIN servers ON devices.server_id = servers.id WHERE device_type = ? AND (jss_name LIKE ? OR jss_serial LIKE ? OR jss_udid LIKE ? OR jss_Model LIKE ? OR servers.org_name LIKE ? OR servers.url LIKE ?)', [platform,wild,wild,wild,wild,wild,wild], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  } else {
    db.get().query('SELECT devices.*, servers.org_name FROM devices JOIN servers ON devices.server_id = servers.id WHERE device_type = ?', platform, function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  }
  });
}

exports.getDevicesByOrg = function(orgName) {
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT devices.*, servers.org_name FROM devices JOIN servers ON devices.server_id = servers.id WHERE server_id IN (SELECT id FROM servers WHERE org_name = ?)', orgName, function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.getStoredDevicesByServer = function(jssURL) {
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT devices.*, servers.org_name FROM devices JOIN servers ON devices.server_id = servers.id WHERE server_id IN (SELECT id FROM servers WHERE url = ?)', jssURL, function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.insertNewDevice = function(deviceData){
  return new Promise(function(resolve,reject) {
    db.get().query('INSERT INTO devices SET ?', deviceData, function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.deleteDeviceByScoutId = function(deviceId){
  return new Promise(function(resolve,reject) {
    db.get().query('DELETE FROM devices WHERE id = ?', [deviceId], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.updateDevice = function(deviceData, deviceId, type){
  var updateObj = {jss_name : deviceData.jss_name, jss_serial : deviceData.jss_serial, jss_last_inventory : deviceData.jss_last_inventory, jss_model : deviceData.jss_model, jss_managed : deviceData.jss_managed, jss_udid : deviceData.jss_udid, is_active: deviceData.is_active};
  return new Promise(function(resolve,reject) {
    db.get().query('UPDATE devices SET ? WHERE jss_udid = ?', [updateObj, deviceData.jss_udid], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.upsertFullInventory = function(deviceObjFromJSS, jss_server_id){
  return new Promise(function(resolve,reject) {
    //Set the colleciton name
    var collectionName = 'computer';
    if ('mobile_device' in deviceObjFromJSS){
      collectionName = 'mobile_device';
    }
    var jss_id = deviceObjFromJSS[collectionName].general.id;
    //Sanatize the name because jss uses wierd curly apostrophe
    deviceObjFromJSS[collectionName].general.name = deviceObjFromJSS[collectionName].general.name.replace(/’/g, "'");
    //See if there is already a record for this device
    exports.getFullInventoryByJSSAndServerId(collectionName, jss_id, jss_server_id)
    .then(function(existingDevice){
      //We didn't find a device
      if (existingDevice == null){
        //Return a promise based on the status of the insert
        resolve(exports.insertFullInventory(deviceObjFromJSS));
      } else {
        // check to see if the device is active or not
        console.log(JSON.stringify(existingDevice, null, 2))
        var timeDiff = new Date().getTime() - Date.parse(existingDevice.report_date_utc);
        var daySinceCheckin = Math.ceil(timeDiff / (1000 * 3600 * 24));
        if (daySinceCheckin >= process.env.DAYS_ACTIVE) {
          existingDevice[collectionName].general.is_active = false;
        } else {
          existingDevice[collectionName].general.is_active = true;
        }
        
        resolve(exports.updateFullInventory(existingDevice, { jss_id : jss_id, jss_server_id : jss_server_id}));
      }
    })
    .catch(error => {
      console.log(error);
      reject(error);
    });
  });
}

exports.getFullInventoryByJSSAndServerId = function(collection, jss_id, jss_server_id){
  return new Promise(function(resolve,reject) {
    db.getNoSQL().collection(collection).findOne({ jss_id : jss_id, jss_server_id : jss_server_id}, function(err, result) {
      if (err){
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

exports.updateFullInventory = function(deviceObj, searchObject){
  var collectionName = 'computer';
  if ('mobile_device' in deviceObj){
    collectionName = 'mobile_device';
  }
  //Add the jss id to the top of the object to make searching easier
  deviceObj.jss_id = deviceObj[collectionName].general.id;
  return new Promise(function(resolve,reject) {
    //Make the update
    db.getNoSQL().collection(collectionName).replaceOne(searchObject,deviceObj, function(err, result) {
      if (err){
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

exports.insertFullInventory = function(deviceObj){
  var collectionName = 'computer';
  if ('mobile_device' in deviceObj){
    collectionName = 'mobile_device';
  }
  //Add the jss id to the top of the object to make searching easier
  deviceObj.jss_id = deviceObj[collectionName].general.id;
  return new Promise(function(resolve,reject) {
    db.getNoSQL().collection(collectionName).insertOne(deviceObj, function(err, result) {
      if (err){
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

function getMDMCommandObjForMobileDeviceList(commandName, deviceList, options){
  //Format the list of device ids in a way the JPS is expecting
  var formattedDevices = [];
  deviceList.forEach(deviceId => {
    var deviceObj = { "mobile_device" : { "id" : deviceId}};
    formattedDevices.push(deviceObj);
  });
  var commandObj =  obj = {
     "mobile_device_command":{
        "general":{
           "command": commandName
        },
        "mobile_devices": formattedDevices
     }
  };
  //Setup some custom fields for certian commands
  if (commandName == 'DeviceName'){
    commandObj.mobile_device_command.general.device_name = options.device_name;
  } else if (commandName == 'DeviceLock' && options != undefined && 'lock_message' in options){
    commandObj.mobile_device_command.general.lock_message = options.lock_message;
  } else if (commandName == 'EnableLostMode'){
    commandObj.mobile_device_command.general.lost_mode_message = options.lost_mode_message;
  }
  return commandObj;
}


function getMDMCommandObjForComputerList(commandName, deviceList, options){
  //Format the list of device ids in a way the JPS is expecting
  var formattedDevices = [];
  deviceList.forEach(deviceId => {
    var deviceObj = { "computer" : { "id" : deviceId}};
    formattedDevices.push(deviceObj);
  });
  var commandObj = {
     "computer_command":{
        "general":{
           "command": commandName
        },
        "computers": formattedDevices
     }
  };
  if ((commandName == 'DeleteUser' || commandName == 'UnlockUserAccount') && options != undefined && 'user_name' in options){
    commandObj.computer_command.general.user_name = options.user_name;
  } else if ((commandName == 'DeviceLock' || commandName == 'EraseDevice') && options != undefined && 'passcode' in options){
    commandObj.computer_command.general.passcode = options.passcode;
  }
  return commandObj;
}

function getMDMCommandObj(commandName, jss_device_id){
  return obj = {
     "mobile_device_command":{
        "general":{
           "command": commandName
        },
        "mobile_devices":[
           {
              "mobile_device":{
                 "id": jss_device_id
              }
           }
        ]
     }
  };
}
