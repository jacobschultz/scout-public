require('dotenv').config();

var servers = require('express').Router();
var server = require('../models/server.js');
var db = require('../common/db.js');
var device = require('../models/device.js');
var schedule = require('node-schedule');
var user = require('../models/user.js');
var exec = require('child_process').exec;
var cron = require('../common/cron-handler.js');
var audit = require('../common/logger.js').logActivity;
var logError = require('../common/logger.js').logError;

/**
 * This endpoint adds a new server
 * @route POST /servers/add
 * @group Servers - Operations about Jamf Pro Servers
 * @param {string} url.body.required - The URL of the Jamf Pro Server
 * @param {string} username.body.required - Admin username of user in the Jamf Pro Server
 * @param {string} password.body.required - Admin password of user in the Jamf Pro Server
 * @param {string} cronLimited.body.required - A cron string that specifys how often to grab limited inventory
 * @param {string} cronExpanded.body.required - A cron string that specifys how often to grab expanded inventory
 * @returns {object} 201 - The server was added to the database successfully, return a status message
 * @returns {object} 206 - The server was added to the database successfully, but the cron jobs on the system could not be verified.
 * @returns {Error}  401 - Unable to contact the JPS server
 * @returns {Error}  500 - Unable to insert server to the database
 * @returns {Error}  206 - Unable to setup scout admin user
 */
servers.post('/add', function(req,res) {
  if (req.body.url == null || req.body.username == null || req.body.password == null || req.body.cronLimited == null || req.body.cronExpanded == null){
    return res.status(400).send({
      error : "Missing Required Fields"
    });
  }
  //Make sure the user has permission
  if (!user.hasPermission(req.user, 'can_create')){
    return res.status(401).send({ error: "User does not have permission to create objects."});
  }
  server.addNewServer(req.body.url, req.body.username, req.body.password, req.body.cronLimited, req.body.cronExpanded)
  .then(function(result) {
    //Need to now resetup the cron jobs
    server.getAllServers()
    .then(function(serverList){
      //Take the server list and pass it to the handler
      cron.handleServerRecords(serverList)
      .then(function(cronResult){
        return res.status(201).send({ status : "success" });
      })
      .catch(function(error){
        logError({message: "Unable to verify cron jobs, please restart your server to fix this.", user: req.user, error});
        return res.status(206).send({ error : "Unable to verify cron jobs, please restart your server to fix this." });
        console.log(error);
      });
    })
    .catch(function(error){
      logError({message: "Unable to verify cron jobs, please restart your server to fix this.", user: req.user, error});
      return res.status(206).send({ error : "Unable to verify cron jobs, please restart your server to fix this." });
      console.log(error);
    });
  })
  .catch(error => {
    console.log(error);
    logError({message: error.error, user: req.user, error});
    if (error.error == "Unable to contact server"){
      return res.status(401).send({ error: "Unable to contact JPS Server - check creds and try again"});
    } else if (error.error == "Unable to insert server to the database"){
      return res.status(500).send({ error: "Unable to insert server to the database. Check the scout logs."});
    } else if (error.error == "Unable to setup scout admin user"){
      return res.status(206).send({ error: "Unable to setup the scout admin user, emergency access will not function."});
    }
    return res.status(500).send({ error: "Unkown error has occured"});
  });
});

/**
 * This endpoint grants emergency access to the server
 * @route POST /servers/access
 * @group Servers - Operations about Jamf Pro Servers
 * @param {string} url.body.required - The URL of the Jamf Pro Server
 * @returns {object} 200 - An object containing the ScoutAdmin user password
 * @returns {Error}  500 - Unable to remove the password from the database after getting it for the user, will not return password
 * @returns {Error} 503 - Scout admin user is deleted
 * @returns {Error} 403 - User is not an admin
 * @returns {Error}  400 - Unable to find server for given url or the server does not have an emergency admin setup
 */
servers.post('/access/', function(req,res){
  //Log that this endpoint is being accessed regardless of outcome
  audit(null, 'Attempted to gain emergency access to server');
  //Make sure this feature isn't disabled
  try {
    if (process.env.DISABLE_SCOUT_ADMIN_USER == "true"){
      return res.status(503).send({error : 'ScoutAdmin user has been disabled'});
    }
  } catch (exc){
    console.log('Unable to verify scout admin user setting, going to try to get it anyway');
  }
  if (!user.hasPermission(req.user, 'is_admin')){
    return res.status(403).send({error : 'No Permissions'});
  }
  //Make sure this user has access to view passwords
  //First make sure there is a password that hasn't been destroyed
  server.getServerFromURL(req.body.url)
  .then(function(serverDetails){
    var encryptedPassword = serverDetails[0].scout_admin_password;
    if (encryptedPassword != '' && encryptedPassword != null){
      var resObj = { password : db.decryptString(encryptedPassword) };
      //destroy the password from the database
      server.setScoutAdminPassword(req.body.url, null)
      .then(function(result){
        audit(req.user, 'ScoutAdmin password access granted');
        return res.status(200).send(resObj);
      })
      .catch(error => {
        console.log(error);
        logError({message: "Unable to destory password, refusing to return password.", user: req.user, error});
        return res.status(500).send({
          error: "Unable to destory password, refusing to return password"
        });
      });
    } else {
      return res.status(400).send({
        error: "No emergency admin password has been setup for this server"
      });
    }
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to find server.", user: req.user, error});
    return res.status(400).send({
      error: "Unable to find server"
    });
  });
});

/**
 * This endpoint adds a new server
 * @route PUT /servers/update/{serverId}
 * @group Servers - Operations about Jamf Pro Servers
 * @param {string} id.query.required - The Id of the Jamf Pro Server to update
 * @param {string} username.body.optional - Admin username of user in the Jamf Pro Server
 * @param {string} password.body.optional - Admin password of user in the Jamf Pro Server
 * @param {string} cronLimited.body.optional - A cron string that specifys how often to grab limited inventory
 * @param {string} cronExpanded.body.optional - A cron string that specifys how often to grab expanded inventory
 * @returns {object} 200 - The server was updated successfully
 * @returns {Error}  500 - Unable to update the JPS server
 * @returns {Error}  403 - Unable to update a specific field
 */
servers.put('/update/:id', function(req,res){
  if (req.params.id == null){
    return res.status(400).send({
      error : "Missing Required Fields"
    });
  }
  //Make sure the user has permission to delete the server
  if (!user.hasPermission(req.user,'can_edit')){
    return res.status(401).send({
      error : "User is not authorized to edit servers"
    });
  }
  //Only allow update of certain fields
  if ("url" in req.body || "scout_admin_id" in req.body || "scout_admin_password" in req.body){
    return res.status(403).send({
      error : "Unable to update specified field"
    });
  }
  //if they are updating the password, encrypt it
  if ("password" in req.body){
    req.body.password = db.encryptString(req.body.password);
  }
  server.updateServer(req.params.id, req.body)
  .then(function(result){
    return res.status(200).send({success : true});
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to update JPS server.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to update JPS server"
    });
  });
});

/**
 * This deletes all devices in the scout database for a given server, they will refresh on next worker run
 * @route DELETE /servers/delete/devices/{serverId}
 * @group Servers - Operations about Jamf Pro Servers
 * @param {string} id.query.required - The Id of the Jamf Pro Server to delete devices from
 * @returns {object} 200 - A success object if the devices fro the server were deleted
 * @returns {Error}  500 - Unable to query the database or delete all of the server's devices
 */
servers.delete('/delete/devices/:serverId', async function(req,res){
  if (!req.params.serverId) {
    return res.status(400).send({ error : "Missing Required Fields" });
  }
  if (!user.hasPermission(req.user,'can_delete')){
    return res.status(401).send({ error : "User is not authorized to delete" });
  }
  device.deleteDevicesByJPSId(req.params.serverId)
  .then(result => {
    return res.status(200).send({ status : "success" });
  })
  .catch(error => {
    return res.status(500).send({ eror : "Unable to delete devices by server id" });
  });
});

/**
 * This deletes a server in scout and all of it's devices
 * @route DELETE /servers/delete/{serverId}
 * @group Servers - Operations about Jamf Pro Servers
 * @param {string} id.query.required - The Id of the Jamf Pro Server to delete
 * @returns {object} 200 - A success object if the server was deleted
 * @returns {Error}  500 - Unable to query the database, delete all of the server's devices, or delete the server itself
 */
servers.delete('/delete/:id', function(req,res) {
  if (req.params.id == null){
    return res.status(400).send({
      error : "Missing Required Fields"
    });
  }
  //Make sure the user has permission to delete the server
  if (!user.hasPermission(req.user,'can_delete')){
    return res.status(401).send({
      error : "User is not authorized to delete servers"
    });
  }
  var serverId = req.params.id;
  var serverObject = null;
  //Delete the server from the database
  server.deleteServer(serverId)
  .then(function(result) {
    serverObject = result.server_object;
    //If success, then delete the devices for that jps
    device.deleteDevicesByJPSId(serverId)
    .then(function(result) {
      //Need to now resetup the cron jobs
      server.getAllServers()
      .then(function(serverList){
        //Take the server list and pass it to the handler
        cron.handleServerRecords(serverList)
        .then(function(cronResult){
          // Remove the scout admin user from the JSS
          server.deleteScoutAdminUser(serverObject.url, serverObject.username, serverObject.password)
          .then(result => {
            return res.status(201).send({ status : "success" });
          })
          .catch(error => {
            console.log(err);
            logError({message: "Unable to remove ScoutAdmin user", user: req.user, error});
            return res.status(206).send({ error : "Unable to remove ScoutAdmin user" });
          });
        })
        .catch(function(error){
          logError({message: "Unable to verify cron jobs.", user: req.user, error});
          return res.status(206).send({ error : "Unable to verify cron jobs, please restart your server to fix this." });
          console.log(error);
        });
      })
    })
    .catch(error => {
      console.log(error);
      logError({message: "Unable to delete devices.", user: req.user, error});
      res.status(500).send({
        error: "Unable to delete devices"
      });
    });
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to delete JPS server.", user: req.user, error});
    res.status(500).send({
      error: "Unable to delete JPS server"
    });
  });
});

/**
 * This gets all of the servers in Scout
 * @route GET /servers/
 * @group Servers - Operations about Jamf Pro Servers
 * @returns {object} 200 - An array of server objects
 * @returns {Error}  500 - Unable to query the database
 */
servers.get('/', function(req,res) {
  //Get all of the servers in the database
  server.getAllServers()
  .then(function(serverList){
    var servers = [];
    for (i = 0; i < serverList.length; i++){
      var s = { "id" : serverList[i].id, "url" : serverList[i].url, "username" : serverList[i].username, "org_name" : serverList[i].org_name, "ac" : serverList[i].activation_code, "cronLimited" : serverList[i].cron_update, "cronExpanded" : serverList[i].cron_update_expanded};
      servers.push(s);
    }
    res.status(200).send({
      servers : servers
    });
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to get servers.", user: req.user, error});
    res.status(500).send({
      error: "Unable to get servers"
    });
  });
});

module.exports = servers;
