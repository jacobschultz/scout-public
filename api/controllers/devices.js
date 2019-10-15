require('dotenv').config();

var devices = require('express').Router();
var device = require('../models/device.js');
var report = require('../models/export.js');
var server = require('../models/server.js');
var inventory = require('../models/inventory.js');
var user = require('../models/user.js');
var db = require('../common/db.js');
var audit = require('../common/logger.js').logActivity;
var logError = require('../common/logger.js').logError;

/**
 * This endpoint returns a list of devices by organization
 * @route GET /devices/server/{orgName}
 * @group Devices - Operations about Scout devices
 * @param {string} orgName.body.required - The organization's name to search for corresponding devices
 * @returns {object} 200 - An array of all devices from an organization
 * @returns {Error} 500 - Unable to query the database
 */
devices.get('/server/:orgName', function(req,res) {
  device.getDevicesByOrg(req.params.orgName)
  .then(function(deviceList){
    return res.status(200).send({
      devices : deviceList
    });
  })
  .catch(error => {
    logError({message: "Unable to get devices.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to get devices"
    });
  });
});

/**
 * This endpoint refreshes every server and every device on each server
 * @route PUT /devices/refresh/all
 * @group Devices - Operations about Scout devices
 * @param {string} type.body.required - Type of update method
 * @returns {object} 200 - Successfully upserts the devices, return a status message
 * @returns {Error} 500 - Unable to upsert new device records, Unable to get devices from Jamf Pro Server, Unable to get list of servers
 * @returns {Error} 400 - Type is not limited
 */
devices.put('/refresh/all', function(req,res){
  //First check the update type and make sure it's supported
  console.log(req.body.type);
  if (req.body.type != 'limited'){
    return res.status(400).send({ error: "Unsupported update method" });
  }
  //Get all of the servers, then for all of those servers, get all devices
  server.getAllServers()
  .then(function(serverList){
    //Loop every server and get all of their devices
    Promise.all(serverList.map(s => server.getAllDevices(s.url, s.id, s.username, db.decryptString(s.password))))
    .then(function(allDevicesAndServers){
      //All devices and servers is an array servers of array of objects
      var allDevices = new Set();
      allDevicesAndServers.forEach(function(serverDevices){
        serverDevices.forEach(d => allDevices.add(d));
      });
      //Now upsert all of these devices
      Promise.all([...allDevices].map(d => device.upsertDevice(d)))
      .then(function(result){
        audit({user: req.user.email, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: "Manually refreshed devices."})
        return res.status(200).send({ status: "success"});
      })
      .catch(error => {
        console.log(error);
        logError({message: "Unable to upsert new device records.", user: req.user, error});
        return res.status(500).send({ error: "Unable to upsert new device records"});
      });
    })
    .catch(error => {
      console.log(error);
      logError({message: "Unable to get devices from Jamf Pro Server", user: req.user, error});
      return res.status(500).send({ error: "Unable to get devices from Jamf Pro Server "});
    });
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to get list of servers.", user: req.user, error});
    return res.status(500).send({ error: "Unable to get list of servers"});
  });
});

/**
 * This endpoint returns the tables for the device search.
 * @route POST /devices/paged/{deviceType}
 * @group Devices - Operations about Scout devices
 * @param {int} start.body.required - Start page number
 * @param {int} length.body.required - Length of each page
 * @param {string} search.value.body.required - Search value for devices
 * @param {string} deviceType.params.required - Type of device to search
 * @returns {object} 200 - Successfully 
 * @returns {Error} 500 - Unable to get devices
 */
devices.post('/paged/:deviceType', function(req,res) {
  var start = parseInt(req.body.start);
  var len = parseInt(req.body.length);
  var search = req.body.search.value;
  device.getDeviceWithSearch(req.params.deviceType, search)
  .then(function(deviceList){
    var obj = getDataTablesRes(req.body.draw,deviceList.slice(start, start + len),deviceList.length,deviceList.length,req.params.deviceType);
    return res.status(200).send(obj);
  })
  .catch(error => {
    logError({message: "Unable to get devices.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to get devices"
    });
  });
});

// devices.post('/paged/:deviceType', function(req,res) {
//   var start = parseInt(req.body.start);
//   var len = parseInt(req.body.length);
//   var search = req.body.search.value;
//   device.getDeviceWithSearch(req.params.deviceType, search)
//   .then(function(deviceList){
//     var obj = getDataTablesRes(req.body.draw,deviceList.slice(start, start + len),deviceList.length,deviceList.length,req.params.deviceType);
//     return res.status(200).send(obj);
//   })
//   .catch(error => {
//     return res.status(500).send({
//       error: "Unable to get devices"
//     });
//   });
// });

/**
 * This endpoint shows all devices 
 * @route GET /devices/
 * @group Devices - Operations about Scout devices
 * @returns {object} 200 - An array of all devices
 * @returns {Error} 500 - Unable to get devices
 */
devices.get('/', function(req,res) {
  device.getAllDevices()
  .then(function(deviceList){
    return res.status(200).send({
      devices : deviceList
    });
  })
  .catch(error => {
    logError({message: "Unable to get devices.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to get devices"
    });
  });
});

/**
 * Output CSV file of all devices
 * @route GET /devices/csv
 * @group Devices - Operations about Scout devices
 * @returns {object} 200 - An array of all devices
 * @returns {Error} 500 - Unable to write file
 */
devices.get('/csv', function(req,res) {
  report.writeCSVOfAllDevices()
  .then(function(stream){
    //Send the server path
    return res.status(200).send({ "status" : "success", "path" : process.env.SCOUT_URL + stream.path.substring(1,stream.path.length)});
  })
  .catch(error => {
    logError({message: "Unable to write csv file.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to write file"
    });
  });
});

/**
 * This endpoint returns all computers in inventory records by id
 * @route GET /devices/computers/expanded/{deviceId}
 * @group Devices - Operations about Scout devices
 * @returns {object} 200 - An array of all devices associated with an id
 * @returns {Error} 500 - Unable to find device record
 */
//Gets an expanded inventory record by id
devices.get('/computers/expanded/:id', function(req,res){
  inventory.getExpandedInventoryById('computers',req.params.id)
  .then(function(result){
    return res.status(200).send(result);
  })
  .catch(error => {
    logError({message: "Unable to find device record.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to find device record"
    });
  });
});

/**
 * Gets a device live from the JPS by UDID and serial
 * @route POST /devices/live/{deviceCollection}
 * @group Devices - Operations about Scout devices
 * @param {string} serial.body.required - Serial number of device
 * @param {string} udid.body.required - UDID of device
 * @returns {object} 400 - The Seriel or UDID is empty sends a message
 * @returns {Error} 500 - Unable to hit the JPS API for this device
 * @returns {Error} 400 - Unable to find device record
 */
//Gets a device live from the JPS by UDID and serial
devices.post('/live/:collection', function(req,res){
  //Make sure required fields are in the post
  if (req.body.serial == null || req.body.udid == null){
    return res.status(400).send({error: "Missing required fields"});
  }
  device.getDeviceByUDIDAndSerial(req.body.serial, req.body.udid)
  .then(function(deviceObj){
    //Now hit the JPS API
    device.getExpandedInventory(deviceObj[0].url,deviceObj[0].username, db.decryptString(deviceObj[0].password), deviceObj[0], deviceObj[0].id)
    .then(function(jpsAPIResponse){
      return res.status(200).send(jpsAPIResponse);
    })
    .catch(error => {
      logError({message: "Unable to hit the JPS API for this device.", user: req.user, error});
      return res.status(500).send({
        error: "Unable to hit the JPS API for this device"
      });
    });
  })
  .catch(error => {
    logError({message: "Unable to find device record.", user: req.user, error});
    return res.status(400).send({
      error: "Unable to find device record"
    });
  });
});

/**
 * This endpoint gets a device live from the JPS by scout Id 
 * @route GET /devices/live/{deviceCollection}/{deviceId}
 * @group Devices - Operations about Scout devices
 * @param {string} id.query.required - Id of device to get
 * @returns {object} 200 - Successfully gets a device live from the JPS
 * @returns {Error} 500 - Unable to hit the JPS API for this device
 * @returns {Error} 400 - Unable to find device record
 */
//Gets a device live from the JPS by scout id
devices.get('/live/:collection/:id', function(req,res){
  //First get the device object from the databse to lookup server details
  device.getDeviceById(req.params.id)
  .then(function(deviceObj){
    //Now use the server details to callout to the JPS
    device.getExpandedInventory(deviceObj[0].url,deviceObj[0].username, db.decryptString(deviceObj[0].password), deviceObj[0], deviceObj[0].id)
    .then(function(jpsAPIResponse){
      return res.status(200).send(jpsAPIResponse);
    })
    .catch(error => {
      logError({message: "Unable to hit the JPS API for this device.", user: req.user, error});
      return res.status(500).send({
        error: "Unable to hit the JPS API for this device"
      });
    });
  })
  .catch(error => {
    logError({message: "Unable to find device record.", user: req.user, error});
    return res.status(400).send({
      error: "Unable to find device record"
    });
  });
});

/**
 * This endpoint shows all computers 
 * @route GET /devices/computers
 * @group Devices - Operations about Scout devices
 * @returns {object} 200 - An array of all computers
 * @returns {Error} 500 - Unable to get computers
 */
devices.get('/computers', function(req,res) {
  device.getDeviceByPlatform('computer')
  .then(function(deviceList){
    return res.status(200).send({
      devices : deviceList
    });
  })
  .catch(error => {
    logError({message: "Unable to get devices.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to get devices"
    });
  });
});

/**
 * This endpoint shows all mobile devices 
 * @route GET /devices/mobiledevices
 * @group Devices - Operations about Scout devices
 * @returns {object} 200 - An array of all mobile devices
 * @returns {Error} 500 - Unable to get mobile devices 
 */
devices.get('/mobiledevices', function(req,res) {
  device.getDeviceByPlatform('mobile')
  .then(function(deviceList){
    return res.status(200).send({
      devices : deviceList
    });
  })
  .catch(error => {
    logError({message: "Unable to get mobile devices.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to get devices"
    });
  });
});

/**
 * This endpoint shows all tvs 
 * @route GET /devices/tvs
 * @group Devices - Operations about Scout devices
 * @returns {object} 200 - An array of all tvs
 * @returns {Error} 500 - Unable to get tvs
 */
devices.get('/tvs', function(req,res) {
  device.getDeviceByPlatform('tv')
  .then(function(deviceList){
    return res.status(200).send({
      devices : deviceList
    });
  })
  .catch(error => {
    logError({message: "Unable to get tvs.", user: req.user, error});
    return res.status(500).send({ error: "Unable to get devices" });
  });
});

/**
 * This endpoint counts all devices of a certain device type
 * @route GET /devices/count/{deviceType}
 * @group Devices - Operations about Scout devices
 * @param {string} deviceType.body.required - Type of device to count
 * @returns {object} 200 - The number of devices of given type
 * @returns {Error} 500 - Unable to get devices
 */
devices.get('/count/:deviceType', function(req,res) {
  device.getDeviceByPlatform(req.params.deviceType)
  .then(function(deviceList){
    return res.status(200).send({ "size" : deviceList.length});
  })
  .catch(error => {
    logError({message: "Unable to get device count.", user: req.user, error});
    return res.status(500).send({ error: "Unable to get devices" });
  });
});

/**
 * This endpoint deletes a scout device with a given id
 * @route DELETE /devices/id/{scoutDeviceId}
 * @group Devices - Operations about Scout devices
 * @param {string} scoutDeviceId.body.required - Id of scout device to delete
 * @returns {object} 200 - The Scout device was deleted successfully
 * @returns {Error} 401 - User is not authorized to delete a scout device
 * @returns {Error} 500 - Unable to delete device with the given scout id
 */
devices.delete('/id/:scoutDeviceId', function(req,res) {
  //Make sure the user has permission to delete a device
  if (!user.hasPermission(req.user, 'can_delete')){
    //This user isn't authorized, exit
    return res.status(401).send({ error : "User has no permissions" });
  }
  device.deleteDeviceByScoutId(req.params.scoutDeviceId)
  .then(result => {
    return res.status(200).send({status : 'success'});
  })
  .catch(error => {
    logError({message: "Unable to delete device by scout id", user: req.user, error});
    return res.status(500).send({error : 'Unable to delete device by scout id'});
  });
});

function getBoolVal(origin){
  if (origin == '1' || origin == 1){
    return true;
  } else {
    return false;
  }
}
function getDataTablesRes(draw, data, totalRecords, filteredRecords,platform){
  var dataList = [];
  for (i = 0; i < data.length; i++){
    //Get the text for the view live button
    var liveViewButton = '<button type="button" class="btn btn-info btn-circle" onclick="getDeviceLive(\''+platform+'\',\''+data[i].jss_serial+'\',\''+ data[i].jss_udid+'\')"><i class="fa fa-eye"></i></button>&nbsp;<button type="button" class="btn btn-danger btn-circle" onclick="deleteDeviceByScoutId(\''+data[i].id+'\')"><i class="fa fa-trash"></i></button>';
    var item = [ data[i].jss_name, data[i].org_name, data[i].jss_Model, data[i].jss_serial, new Date(data[i].jss_last_inventory).toLocaleDateString(), data[i].jss_udid, getBoolVal(data[i].jss_managed), getBoolVal(data[i].is_active), liveViewButton];
    dataList.push(item);
  }
  return { "draw" : parseInt(draw), "recordsTotal" : totalRecords, "recordsFiltered" :  filteredRecords, "data" : dataList};
}

module.exports = devices;
