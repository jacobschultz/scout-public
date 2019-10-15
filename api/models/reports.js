var db = require('../common/db.js');
var fs = require('fs');
const path = require("path");

exports.getSupportedFields = function(){
  return new Promise(function(resolve,reject) {
    try {
      //get the current mapping of API supported fields, to UI friendly strings
      var computerMappings = fs.readFileSync(path.resolve(__dirname, '../common/api-field-mappings-computer.json'), 'utf-8');
      //get the current mappings for mobile as well
      var mobileMappings = fs.readFileSync(path.resolve(__dirname, '../common/api-field-mappings-mobile.json'), 'utf-8');
      //parse to an object and return
      var fields = {};
      fields.computer = JSON.parse(computerMappings);
      fields.mobile = JSON.parse(mobileMappings);
      resolve(fields);
    } catch (e){
      reject(e);
    }
  });
}

//Converts a line item stored in the database to one similar to the UI
exports.convertDbLineItem = function(lineItem){
  var newLineItem = {};
  newLineItem.junction = lineItem.condition;
  newLineItem.param_one = lineItem.parenthesis_one;
  newLineItem.operator = lineItem.operator;
  newLineItem.value = lineItem.value;
  newLineItem.field = lineItem.field;
  newLineItem.param_two = lineItem.parenthesis_two;
  return newLineItem;
}

exports.parseIntoQuery = function(searchLineItems, reportType){
  //Group all of the items if there are sub queries
  var grouped = [];
  var i = 0;
  var lastGroupObject = null;
  //Ignore parenthis for one item seraches and make it always an AND
  if (searchLineItems.length == 1){
    searchLineItems[0].junction = 'AND';
    grouped.push(searchLineItems[0]);
  //If there are only two items, it's easy enough to just set both groupings to that condition
  } else if (searchLineItems.length == 2){
    searchLineItems.forEach(l => {
      l.junction = searchLineItems[1].junction;
      grouped.push(l);
    });
  } else {
    while (i < searchLineItems.length){
      if (i == 0 && searchLineItems[i].junction != 'AND' && searchLineItems[i].junction != 'OR'){
        searchLineItems[i].junction = searchLineItems[i+1].junction;
      } else
      //Default to AND if no junction unless i + 1 exsits and isn't AND
      if (searchLineItems[i].junction != 'AND' && searchLineItems[i].junction != 'OR'){
          searchLineItems[i].junction = 'AND';
      }
      //We found a new grouping
      if (lastGroupObject == null && searchLineItems[i].param_one == 1){
          //Find the object before this so we now where to include the group
          lastGroupObject = {};
          lastGroupObject.last_junction = searchLineItems[i].junction;
          //Only can have one operator per parenthesis so default to this one
          lastGroupObject.junction = searchLineItems[i + 1].junction;
          lastGroupObject.items = [];
          lastGroupObject.items.push(searchLineItems[i]);
      //Add another one to the grouping
      } else if (lastGroupObject != null && searchLineItems[i].param_two == 0){
        //Push to the grouping
        lastGroupObject.items.push(searchLineItems[i]);
      //This is the end of the grouping
      } else if (lastGroupObject != null && searchLineItems[i].param_two == 1){
        lastGroupObject.items.push(searchLineItems[i]);
        //reset the group placeholder and add the current one to the list of grouped objects.
        grouped.push(lastGroupObject);
        lastGroupObject = null;
      } else {
        //This isn't a grouping, just push the line item
        grouped.push(searchLineItems[i]);
      }
      //continue on
      i++;
    }
  }
  var mongoSearchObject = {};
  //Now we are going to build a nosql object for each of the items
  for (var i = 0; i < grouped.length; i++){
    //This is a grouped object
    if ('last_junction' in grouped[i]){
      //create a parent object to hold this grouping
      var subSearchItem = {};
      //create an array to hold the search items
      subSearchItem[operatorToNoSQL(grouped[i].junction)] = [];
      //for each of the line items, get a search item
      grouped[i].items.forEach(function(l){
        subSearchItem[operatorToNoSQL(grouped[i].junction)].push(getSearchObject(reportType,l.field, l.operator, l.value));
      });
      //Add it to the correct parent operator
      //Check if the parent operator exists in the parent object
      if (operatorToNoSQL(grouped[i].last_junction) in mongoSearchObject){
        mongoSearchObject[operatorToNoSQL(grouped[i].last_junction)].push(subSearchItem);
      } else {
        //create a new array to store the items
        mongoSearchObject[operatorToNoSQL(grouped[i].last_junction)] = [];
        mongoSearchObject[operatorToNoSQL(grouped[i].last_junction)].push(subSearchItem);
      }
    } else {
      //Check if the search object has this operator, if not add it
      if (operatorToNoSQL(grouped[i].junction) in mongoSearchObject){
        //Create a nosql line item
        var lineItem = getSearchObject(reportType,grouped[i].field, grouped[i].operator, grouped[i].value);
        //push it to the mongo search object
        mongoSearchObject[operatorToNoSQL(grouped[i].junction)].push(lineItem);
      } else {
        //Create a nosql line item
        var lineItem = getSearchObject(reportType,grouped[i].field, grouped[i].operator, grouped[i].value);
        //create an array to store the searches
        mongoSearchObject[operatorToNoSQL(grouped[i].junction)] = [];
        mongoSearchObject[operatorToNoSQL(grouped[i].junction)].push(lineItem);
      }
    }
  }
  return mongoSearchObject;
}

//Get matching inventory record by category and field search
exports.getRecordsForSearchObject = function(collection, searchObject){
  return new Promise(function(resolve,reject) {
    db.getNoSQL().collection(collection).find(searchObject).toArray(function(err, result) {
      if (err){
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

exports.updateReportById = function(reportObject, reportId){
  return new Promise(function(resolve,reject) {
    db.get().query('UPDATE reports SET ? WHERE id = ?', [reportObject,reportId], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.updateReportLineItem = function(lineItem, order, reportId){
  //Set some meta fields
  lineItem.report_id = reportId;
  //Check if we need to replace a parenthesis with a boolean value
  if (lineItem.parenthesis_one == "("){
    lineItem.parenthesis_one = true;
  }
  if (lineItem.parenthesis_two == ")"){
    lineItem.parenthesis_two = true;
  }
  return new Promise(function(resolve,reject) {
    //First make sure this line item exists
    db.get().query('SELECT item_order,report_id FROM reports_line_item WHERE item_order = ? AND report_id = ?', [order,reportId], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        //If it already exists, update it, else insert a new one
        if (results.length > 0){
          db.get().query('UPDATE reports_line_item SET ? WHERE item_order = ? AND report_id = ?', [lineItem,order,reportId], function(error, results, fields) {
            if (error) {
              reject(error);
            } else {
              resolve(results);
            }
          });
        } else {
          exports.insertReportLineItem(lineItem, reportId)
          .then(success => {
            resolve(success);
          })
          .catch(error => {
            reject(error);
          });
        }
      }
    });
  });
}

exports.insertReportObject = function(reportObject){
  return new Promise(function(resolve,reject) {
    db.get().query('INSERT INTO reports SET ?', [reportObject], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.deleteReport = function(reportId){
  return new Promise(function(resolve,reject) {
    db.get().query('DELETE FROM reports WHERE id = ?', [reportId], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        db.get().query('DELETE FROM reports_line_item WHERE report_id = ?', [reportId], function(error, results, fields) {
          if (error) {
            reject(error);
          } else {
            resolve(results);
          }
        });
      }
    });
  });
}

exports.getReports = function(){
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT reports.*, users.email FROM reports JOIN users ON reports.created_by = users.id ORDER BY reports.created DESC', function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.insertReportLineItem = function(lineItem, reportId){
  lineItem.report_id = reportId;
  //Check if we need to replace a parenthesis with a boolean value
  if (lineItem.parenthesis_one == "("){
    lineItem.parenthesis_one = 1;
  } else {
    lineItem.parenthesis_one = 0;
  }
  if (lineItem.parenthesis_two == ")"){
    lineItem.parenthesis_two = 1;
  } else {
    lineItem.parenthesis_two = 0;
  }
  return new Promise(function(resolve,reject) {
    db.get().query('INSERT INTO reports_line_item SET ?', [lineItem], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.getReportById = function(reportId){
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT * FROM reports WHERE id = ?',[reportId], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        //Now get the line items
        var reportObj = results[0];
        db.get().query('SELECT * FROM reports_line_item WHERE report_id = ?',[reportId], function(error, results, fields) {
          if (error) {
            reject(error);
          } else {
            //Setup the line items
            reportObj.line_items = results;
            resolve(reportObj);
          }
        });
      }
    });
  });
}

function getSearchObject(collection, field, operation, searchValue){
  console.log(collection);
  console.log(field);
  console.log(operation);
  console.log(searchValue);
  //Overrite some fields that are different for mobile devices
  if (field == 'general.name' && collection == 'mobile_device'){
    field = 'general.display_name';
  }
  var pathString = collection + "." + field;
  //Build the actual search object
  var searchObject = {};
  var operationObject = operationToObject(operation, searchValue, field);
  searchObject[pathString] = operationObject;
  console.log(searchObject);
  return searchObject;
}

function operatorToNoSQL(value){
  if (value == "AND"){
    return '$and';
  } else if (value == "OR"){
    return '$or';
  }
}

function operationToObject(operation, value, field){
  var nubmerSearch = /^\d+$/;
  //Check what type of value is and cast it to the correct object
  if (value.toLowerCase() == "true" || value.toLowerCase() == "false"){
    value = Boolean(value);
  //Phone is a string in the JPS TODO: Add other non-conforming fields
  } else if (nubmerSearch.test(value) && !field.includes('phone')){
    value = Number(value);
  }
  //if we didn't cast it's probably a string
  if (operation == "equals"){
    return { "$eq" : value};
  } else if (operation == "does not equal"){
    return { "$ne" : value};
  } else if (operation == "is greater than"){
    return { "$gt" : value};
  } else if (operation == "is less than"){
    return { "$lt" : value};
  } else if (operation == "contains"){
    var pattern = `.*${value}.*`
    return new RegExp(pattern);
  } else if (operation == "does not contain"){
    var pattern = `.*${value}.*`
    return { $not: new RegExp(pattern) };
  }
  return '';
}

function addCommaIfRequired(s, i, length) {
  if (i < length -1) {
    return s += ',';
  } else {
    return s;
  }
}

function getKeyForDeviceObj(obj){
  var key = "computer";
  //Default to computer, if it has a mobile_device key, then go with that
  if ('mobile_device' in obj){
    key = 'mobile_device';
  }
  return key;
}

exports.buildExportCsv = function(fields, resultsObjects) {
  // First write the headers
  let csv = '';
  fields = fields.split(",");
  for (i = 0; i < fields.length; i++) {
    csv += addCommaIfRequired(fields[i], i, fields.length);
  }
  csv += '\n';
  // Now write all of the records
  resultsObjects.forEach(obj => {
    var deviceType = getKeyForDeviceObj(obj);
    for (let i = 0; i < fields.length; i++) {
      const c = fields[i].replace(/\s/g,'');
      var parentCategory = c.split(".")[0];
      var dataCategory = c.split(".")[1];
      csv += addCommaIfRequired(obj[deviceType][parentCategory][dataCategory], i, fields.length);
    }
    csv += '\n';
  });
  return csv;
}

async function writeCsvFile(name, csvString){
  return new Promise(function(resolve,reject) {
    //write the string to the new env, randomize so these can't be found easy
    const fileName = 'reports/' + db.getRandomString(10) + '-' + name + '-' + new Date().getTime() + '.csv';
    fs.writeFile(fileName, csvString, function(err) {
      if(err) {
        reject(err);
      }
      resolve(fileName);
    });
  });
}
exports.writeCsvFile = writeCsvFile;
