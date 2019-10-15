var patches = require('express').Router();
var patch = require('../models/patch.js');

/**
 * This endpoint reads each software patch title from the server
 * @route GET /patches/software
 * @group Patches - Operations about Scout patches
 * @returns {object} 200 - Array of all patch titles from the server
 * @returns {Error} 500 - Unable to read patches
 */
patches.get('/software', function(req,res) {
  //Get all of the patches from the server
  patch.getPatchesFromFile()
  .then(function(patches){
    var patchList = [];
    //Parse each full patch to a subset for response
    patches.forEach(function(p) {
      patchList.push(getPatchSubset(p));
    });
    res.status(200).send(patchList);
  })
  .catch(error => {
    console.log(error);
    res.status(500).send({
      error: "Unable to read patches"
    });
  });
});

/**
 * This endpoint gets all patches from patch servers
 * @route GET /patches/servers
 * @group Patches - Operations about Scout patches
 * @returns {object} 200 - Array of all patches from the server
 * @returns {Error} 500 - Unable to get servers
 */
patches.get('/servers', function(req,res){
  patch.getPatchServers()
  .then(function(servers){
    res.status(200).send(servers);
  })
  .catch(error => {
    res.status(500).send({
      error: "Unable to get servers"
    });
  });
});

/**
 * This endpoint adds a server to the database
 * @route POST /patches/servers/create
 * @group Patches - Operations about Scout patches
 * @param {string} url.body.required - The URL of the Jamf Pro Server
 * @param {string} cron.body.required - A cron string that specifys how often to grab inventory
 * @returns {object} 200 - The server was added to the databse successfully
 * @returns {Error} 400 - Missing url or cron fields
 * @returns {Error} 401 - User doesn't have permissions to add a server
 * @returns {Error} 500 - Unable to add server to database
 */
patches.post('/servers/create', function(req,res){
  if (req.body.url == null || req.body.cron == null){
    return res.status(400).send({
      error: "Missing required fields"
    });
  }
  //Make sure the user has permission
  if (!user.hasPermission(req.user, 'can_create')){
    return res.status(401).send({ error: "User does not have permission to create objects."});
  }
  //Add the server to the database
  var server = { "base_url" : req.body.url, "cron_update" : req.body.cron};
  patch.addPatchServer(server)
  .then(function(result){
    res.status(200).send(server);
  })
  .catch(error => {
    res.status(500).send({
      error: "Unable to add server to database"
    });
  });
});

/**
 * This endpoint shows all software titles for patches
 * @route GET /patches/software/{titles}
 * @group Patches - Operations about Scout patches
 * @param {string} titles.query.required - Titles of software patches
 * @returns {object} 200 - Array of software titles for patches
 * @returns {Error} 500 - Unable to read patches
 */
patches.get('/software/:titles', function(req,res) {
  var softwareTitles = [];
  //Check if multiple titles have been provided
  if (req.params.titles.includes(',')){
    softwareTitles = req.params.titles.split(',');
  } else {
    softwareTitles.push(req.params.titles);
  }
  Promise.all(softwareTitles.map(patchId => patch.getPatchById(patchId)))
  .then(function(files){
    var patchList = [];
    files.forEach(function(p) {
      patchList.push(getPatchSubset(p));
    });
    res.status(200).send(patchList);
  })
  .catch(error => {
    console.log(error);
    res.status(500).send({
      error: "Unable to read patches"
    });
  });
});

/**
 * This endpoint shows patch for specific softwareId
 * @route GET /patches/patch/{titleId}
 * @group Patches - Operations about Scout patches
 * @param {string} titleId.query.required - Titles of software patches
 * @returns {object} 200 - Software title for specific softwareId
 * @returns {Error} 500 - Unable to read patches
 */
patches.get('/patch/:titleId', function(req,res) {
  var softwareId = req.params.titleId;
  patch.getPatchById(softwareId)
  .then(function(file){
    res.status(200).send(file);
  })
  .catch(error => {
    res.status(500).send({
      error: "Unable to read patches"
    });
  });
});

function getPatchSubset(fullPatch){
  return { "currentVersion" : fullPatch.currentVersion, "id" : fullPatch.id, "lastModified" : fullPatch.lastModified, "name" : fullPatch.name, "publisher" : fullPatch.publisher };
}

module.exports = patches;
