require('dotenv').config();
var adminController = require('express').Router();
var user = require('../models/user.js');
var admin = require('../models/admin.js');
var crontab = require('cron-tab');
var cron = require('../common/cron-handler.js');
var servers = require('../models/server.js');
var audit = require('../common/logger.js').logActivity;
var logError = require('../common/logger.js').logError;

adminController.get('/organization/details', function(req,res){
  //try to get the org name from the env settings
  try {
    if (!process.env.HEADER_DISPLAY_NAME){
      return res.status(200).send({ header_name : 'Scout'});
    } else {
      if (!user.hasPermission(req.user, 'is_admin')){
        let responseObject = { header_name : process.env.HEADER_DISPLAY_NAME};
        return res.status(200).send(responseObject);
      } else {
        // Get the current cron jobs related to scout
        crontab.load(function(err, crontab){
          if (err) {
            logError({message: "Unable to read server settings.", user: req.user, error: err});
            return res.status(500).send({ error : 'Unable to read server settings.'});
          }
          let responseObject = { header_name : process.env.HEADER_DISPLAY_NAME};
          responseObject.cron_jobs = crontab.jobs({comment:/Scout-Update-/}).map(e => e.toString());
          return res.status(200).send(responseObject);
        });
      }
    }
  } catch (exc){
    console.log(exc);
    logError({message: "Unable to read server settings.", user: req.user, error: exc});
    return res.status(500).send({ error : 'Unable to read server settings.'});
  }
});

adminController.get('/all', function(req,res){
  //Make sure the user is an admin
  if (!user.hasPermission(req.user, 'is_admin')){
    //This user isn't authorized, exit
    audit(req.user, "Failed attempt to access admin.");
    return res.status(401).send({ error : "User has no permissions" });
  }
  //Get settings from the .env file, don't include passwords
  admin.readCurrentEnvSettings(false)
  .then(function(settings){
    audit({user: req.user, message: "Admin settings accessed"});
    //return the settings object
    return res.status(200).send(settings);
  })
  .catch(error => {
    logError({message: "Unable to read settings.", user: req.user, error});
    return res.status(500).send({error: "Unable to read settings"});
  });
});

adminController.put('/user', function(req,res){
  //Make sure the user has permission to edit users
  if (!user.hasPermission(req.user, 'can_edit_users')){
    audit(req.user, "Failed attempt to edit users.")
    //This user isn't authorized, exit
    return res.status(401).send({ error : "User has no permissions" });
  }
  //Make sure the request if valid
  if (!req.body.userId || !req.body.permission || req.body.newValue == undefined){
    return res.status(400).send({ error : "Missing required fields" });
  }
  //Make the update and return a response
  admin.updateUserSettings(req.body.permission, req.body.newValue, req.body.userId)
  .then(function(result){
    audit(req.user, `Updated User ${req.body.userID} with ${req.body.newValue}`)
    return res.status(200).send({ status : "success"});
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to update user record.", user: req.user, error});
    return res.status(500).send({error : "Unable to update user record"});
  });
})

adminController.put('/all', function(req,res){
  //Make sure the user is an admin
  if (!user.hasPermission(req.user, 'is_admin')){
    audit(req.user, "Failed attempt to edit admin settings")
    //This user isn't authorized, exit
    return res.status(401).send({ error : "User has no permissions" });
  }
  if (!req.body || Object.keys(req.body).length == 0){
    return res.status(400).send({ error : "Must provide new file values" });
  }
  //Attempt to upsert the new file #TODO more validation on the user input
  admin.upsertNewSettings(req.body)
  .then(function(result){
    audit(req.user, "Successfully upserted new settings.")
    return res.status(200).send({status : "success"});
  })
  .catch(error => {
    logError({message: "Unable to update file.", user: req.user, error});
    return res.status(500).send({error : "Unable to update file"});
  });
});

adminController.put('/cronjobs', function(req,res) {
  //Make sure the user is an admin
  if (!user.hasPermission(req.user, 'is_admin')){
    audit(req.user, "Failed attempt to edit cronjobs")
    //This user isn't authorized, exit
    return res.status(401).send({ error : "User has no permissions" });
  }
  //For revery server in the database, make sure our cron jobs are up to date
  servers.getAllServers()
  .then(function(serverList){
    //Take the server list and pass it to the handler
    cron.handleServerRecords(serverList)
    .then(function(cronResult){
      audit(req.user, "Verified cron jobs.")
      return res.status(200).send({status : "success"});
    })
    .catch(function(error){
      logError({message: "Unable to verify cron jobs.", user: req.user, error});
      return res.status(500).send({error : 'Unable to verify cron jobs'});
    });
  })
  .catch(function(error){
    logError({message: "Unable to verify cron jobs.", user: req.user, error});
    return res.status(500).send({error : 'Unable to verify cron jobs'});
  });
});

module.exports = adminController;
