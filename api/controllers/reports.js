var reports = require('express').Router();
var report = require('../models/reports.js');
var user = require('../models/user.js');
const audit = require('../common/logger.js').logActivity;
const logError = require('../common/logger.js').logError;

/**
 * This endpoint gets all supported fields to add to the UI
 * @route GET /reports/builder/fields
 * @group Reports - Operations about Scout Reports
 * @returns {object} 200 - A List of all supported fields and UI names
 * @returns {Error}  500 - Unable to get supported fields
 */
reports.get('/builder/fields', function(req,res) {
  //get all of the supported fields and their UI name
  report.getSupportedFields()
  .then(function(fieldList){
    //Return it to the client to add to the UI
    return res.status(200).send(fieldList);
  })
  .catch(error => {
    console.log(error);
    return res.status(500).send({
      error: "Unable to get supported fields"
    });
  });
});

/**
 * This endpoint returns all reports
 * @route GET /reports/
 * @group Reports - Operations about Scout Reports
 * @returns {object} 200 - A List of all reports
 * @returns {Error}  500 - Unable to get reports
 */
//Returns all of the reports
reports.get('/', function(req,res){
  //Return all of the reports
  report.getReports()
  .then(function(reports){
    return res.status(200).send(reports);
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to get reports.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to get reports"
    });
  });
});

/**
 * This endpoint gets a report with specific Id
 * @route GET /reports/id/{reportId}
 * @group Reports - Operations about Scout Reports
 * @param {string} reportId.body.required - Id of report to view
 * @returns {object} 200 - Report for specific reportId
 * @returns {Error}  400 - Missing report Id
 * @returns {Error}  500 - Unable to get report
 */
//Gets a report by id
reports.get('/id/:reportId', function(req,res){
  //make sure the report id was provided in the request
  if (!req.params.reportId){
    return res.status(400).send({
      error: "Missing report id"
    });
  }
  //Get the report and it's line items from the database
  report.getReportById(req.params.reportId)
  .then(function(report){
    return res.status(200).send(report);
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to get report.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to get report"
    });
  });
});

/**
 * This endpoint deletes a report with a specific Id
 * @route DELETE /reports/id/{reportId}
 * @group Reports - Operations about Scout Reports
 * @param {string} reportId.body.required - Id of report to view
 * @returns {object} 200 - Report for specific reportId with success status message
 * @returns {Error}  400 - Missing report Id
 * @returns {Error}  401 - User doesn't have permission to delete objects
 * @returns {Error}  500 - Unable to delete report or it's line items
 */
//Deletes a report by id
reports.delete('/id/:reportId', function(req,res){
  //make sure the report id was provided in the request
  if (!req.params.reportId){
    return res.status(400).send({
      error: "Missing report id"
    });
  }
  //Make sure the user has permission to delete the report
  if (!user.hasPermission(req.user, 'can_delete')){
    audit({user: req.user, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: "Failed attempt to delete a report."});
    return res.status(401).send({ error: "User does not have permission to delete objects."});
  }
  //Get the report and it's line items from the database
  report.deleteReport(req.params.reportId)
  .then(function(result){
    audit({user: req.user, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: `Successfully deleted report ${req.params.reportId}`});
    return res.status(200).send({status : 'success'});
  })
  .catch(error => {
    logError({message: "Unable to delete report or it's line items.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to delete report or it's line items."
    });
  });
});

/**
 * This endpoint updates a report with a specific reportId
 * @route PUT /reports/update/{reportId}
 * @group Reports - Operations about Scout Reports
 * @param {string} name.body.required - Name of Report to update
 * @param {string} line_items.body.required - Line items of report to update
 * @param {string} fields_to_select.body.required - Fields in report to edit
 * @param {string} reportId.body.required - Id of report to edit
 * @returns {object} 200 - Report updated successfully, success message
 * @returns {Error}  400 - Missing required fields
 * @returns {Error}  401 - User doesn't have permission to edit objects
 * @returns {Error}  500 - Unable to update report line items, Unable to update report
 */
reports.put('/update/:reportId', function(req,res){
  //Make sure everything is in the request
  if (!req.body.name || !req.body.line_items || req.body.line_items.length < 1 || !req.params.reportId){
    res.status(400).send({
      error: "Missing required fields"
    });
  }
  //Make sure the user has permission to update
  if (!user.hasPermission(req.user, 'can_edit')){
    audit({user: req.user, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: `Failed attempt to create a update report.`});
    return res.status(401).send({ error: "User does not have permission to edit objects."});
  }
  //Rebuild the report object
  var reportObj = req.body;
  reportObj.conditions_count = req.body.line_items.length;
  reportObj.type = req.body.type;
  //Only overwrite fields to select if they are provided
  if (req.body.fields_to_select){
    reportObj.fields_to_select = req.body.fields_to_select;
  }
  console.log(reportObj);
  //Copy these out so we can update the parent report object first
  var lineItems = req.body.line_items;
  delete reportObj.line_items;
  //Update the parent report object
  report.updateReportById(reportObj, req.params.reportId)
  .then(function(result){
    Promise.all(lineItems.map(lineItem => report.updateReportLineItem(lineItem,lineItem.item_order,req.params.reportId))).then(function(results){
      audit({user: req.user, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: `Successfully created report ${req.params.reportId}`, reportObj});
      return res.status(200).send({ "status" : "success", "id" : req.params.reportId});
    })
    .catch(error => {
      console.log(error);
      logError({message: "Unable to update report line items.", user: req.user, error});
      return res.status(500).send({
        error: "Unable to update report line items"
      });
    });
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to update report.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to update report"
    });
  });
});

/**
 * This endpoint saves a report to the databse to be used later
 * @route POST /reports/save
 * @group Reports - Operations about Scout Reports
 * @param {string} name.body.required - Name of Report to save
 * @param {string} line_items.body.required - Line items of report to save
 * @param {string} fields_to_select.body.required - Fields in report to save
 * @returns {object} 200 - Successfully inserted report, success message with inserted reportId
 * @returns {Error}  400 - Missing required fields
 * @returns {Error}  401 - User doesn't have permission to edit objects
 * @returns {Error}  500 - Unable to insert report line items, Unable to insert new report
 */
//Saves a report to the database to be used later
reports.post('/save', function(req,res){
  //Make sure everything is in the request
  if (!req.body.name || !req.body.line_items || req.body.line_items.length < 1){
    return res.status(400).send({
      error: "Missing required fields"
    });
  }
  //Make sure the user has permission
  if (!user.hasPermission(req.user, 'can_create')){
    audit({user: req.user, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: `Failed attempt to create a report.`});
    return res.status(401).send({ error: "User does not have permission to create objects."});
  }
  //Copy out the line items to be inserted after the parent report
  var reportObj = req.body;
  reportObj.created = new Date();
  reportObj.created_by = req.user.id;
  reportObj.conditions_count = req.body.line_items.length;
  reportObj.type = req.body.type;
  //Default to some fields to select if not provided
  if (!req.body.fields_to_select){
    reportObj.fields_to_select = 'general.id, general.name';
  } else {
    reportObj.fields_to_select = req.body.fields_to_select;
  }
  var lineItems = req.body.line_items;
  delete reportObj.line_items;
  //Insert the report
  report.insertReportObject(reportObj)
  .then(function(result){
    //the insert id is the report id
    var newReportId = result.insertId;
    Promise.all(lineItems.map(lineItem => report.insertReportLineItem(lineItem, newReportId))).then(function(results){
      audit({user: req.user, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: `Successfully deleted report ${req.params.reportId}`});
      return res.status(200).send({ "status" : "success", "id" : newReportId});
    })
    .catch(error => {
      console.log(error);
      logError({message: "Unable to insert report line items.", user: req.user, error});
      return res.status(500).send({
        error: "Unable to insert report line items"
      });
    });
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to insert new report.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to insert new report"
    });
  });
});

/**
 * This endpoint does an advanced search by id
 * @route GET /reports/search/{reportId}
 * @group Reports - Operations about Scout Reports
 * @param {string} reportId.body.required - Id of report to search
 * @returns {object} 200 - Successfully query of report, Array of all records for specific reportId
 * @returns {Error}  400 - Missing required fields
 * @returns {Error}  500 - Unable to perform search, Unable to get report
 */
reports.post('/export/:reportId', async function(req,res) {
  //Make sure a report Id was provided
  if (!req.params.reportId){
    return res.status(400).send({ error: "Missing required fields" });
  }
  // Get the report and it's results
  report.getReportById(req.params.reportId)
  .then(async function(reportObj){
    var lineItemsConverted = [];
    reportObj.line_items.forEach(function(l){
      lineItemsConverted.push(report.convertDbLineItem(l));
    });
    var searchObject = report.parseIntoQuery(lineItemsConverted,reportObj.type);
    var reportBuilder = { fields_to_select : reportObj.fields_to_select};
    report.getRecordsForSearchObject(reportObj.type, searchObject)
    .then(async function(results){
      // Build a csv then write it out
      const csvString = report.buildExportCsv(reportBuilder.fields_to_select, results);
      const fileName = await report.writeCsvFile(reportObj.name, csvString);
      return res.status(200).send({ status : 'success', path: process.env.SCOUT_URL + '/' + fileName});
    })
    .catch(err => {
      return res.status(500).send({error: "Unable to query for results"  });
    })
  })
  .catch(error => {
    return res.status(500).send({error: "Unable to get report"  });
  });
});

//Does an advanced search by id
reports.get('/search/:reportId', function(req,res){
  //Make sure a report Id was provided
  if (!req.params.reportId){
    return res.status(400).send({
      error: "Missing required fields"
    });
  }
  //Get the report and it's line items by id
  report.getReportById(req.params.reportId)
  .then(function(reportObj){
    //Convert it's line items to a query string
    var lineItemsConverted = [];
    reportObj.line_items.forEach(function(l){
      lineItemsConverted.push(report.convertDbLineItem(l));
    });
    var searchObject = report.parseIntoQuery(lineItemsConverted,reportObj.type);
    var respObj = { fields_to_select : reportObj.fields_to_select};
    //Now perform the query
    report.getRecordsForSearchObject(reportObj.type, searchObject)
    .then(function(results){
      respObj.results = results;
      respObj.mongo_query = searchObject;
      audit({user: req.user, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, details: {mongo_query: searchObject, results: respObj.results}, message: `Report ran for report ${req.params.reportId}`});
      return res.status(200).send(respObj);
    })
    .catch(error => {
      console.log(error);
      logError({message: "Unable to perform search.", user: req.user, error});
      return res.status(500).send({
        error: "Unable to perform search"
      });
    });
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to get report.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to get report"
    });
  });
});

/**
 * This endpoint searches for report based on given details
 * @route POST /reports/search
 * @group Reports - Operations about Scout Reports
 * @param {string} search_line_items.body.required - Criteria to search for reports 
 * @returns {object} 200 - Successfully query of report, Array of all records for specific reportId
 * @returns {Error}  400 - No search terms provided
 * @returns {Error}  500 - Unable to perform search
 */
reports.post('/search', function(req,res) {
  //make sure they provided some search terms
  if (!req.body.search_line_items || req.body.search_line_items.length < 1){
    return res.status(400).send({
      error: "No search terms provided"
    });
  }
  //Parse the search items into a NoSQL query
  var searchObject = report.parseIntoQuery(req.body.search_line_items);
  console.log(searchObject);
  //Now perform the query
  report.getRecordsForSearchObject("computer", searchObject)
  .then(function(results){
    return res.status(200).send(results);
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to perform search.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to perform search"
    });
  });
});

module.exports = reports;
