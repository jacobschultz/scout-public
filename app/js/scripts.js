window.all_crons = null;
function getOrgDetails(){
  var details = getRequestObject('/settings/organization/details', null, 'GET');
  details.done(function(detailsObject){
    if ('header_name' in detailsObject){
      $("#header_display_name").html(detailsObject.header_name);
    }
    if ('cron_jobs' in detailsObject){
      window.all_crons = detailsObject.cron_jobs;
      var scoutTable = $("#cron-jobs-table").DataTable();
      scoutTable.clear();
      for (i = 0; i < detailsObject.cron_jobs.length; i++) {
        let cronDetails = detailsObject.cron_jobs[i].split(' ');
        const button = '<button onclick="viewFullCronString('+i+');" type="button" class="btn btn-info btn-circle"><i class="fa fa-eye"></i></button>';
        scoutTable.row.add([cronDetails[0], cronDetails[3], cronDetails[4], button]);
      }
      scoutTable.draw(false);
    }
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function viewFullCronString(index) {
  swal('Full Cron String: ',
    window.all_crons[i],
    'success');
}

function updateCronJobsOnScoutServer() {
  swal({
    title: "Confirm Action",
    text: "Are you sure you want to manually refresh the scout cron jobs? This will update the cron jobs with all jamf pro servers in the database. This writes directly to the system crontab file and can't be undone.",
    icon: "warning",
    buttons: true,
    dangerMode: true
  })
  .then((willSync) => {
    if (willSync){
      var cronJobs = getRequestObject('/settings/cronjobs', null, 'PUT');
      cronJobs.done(function(result){
        swal('Cron jobs updated!', 'The cron jobs in the scout databse have been syncronized to the server. Verify they are correct in the cron job table. ','success');
      })
      .fail(function(xhr){
        swal('Error', 'Scout was unable to update the cron jobs on the scout server. Please try restarting the server.','error');
      });
    }
  });
}

function refreshAllDevices(showPrompt){
  $.Toast.showToast({
    "title": "Refreshing all devices, this could take awhile if there are a lot of servers in scout.",
    "icon": "loading",
    "duration": 60000
  });
  var reqBody = {type : 'limited'};
  var result = getRequestObject('/devices/refresh/all', reqBody, 'PUT');
  result.done(function(r){
    $.Toast.hideToast();
    getComputerCount();
    getMobileDeviceCounts();
    getTvCount();
    if (showPrompt){
      swal('Devices Updating...', 'The devices are continuing to update in the background, try refreshing the devices view in a few secords or more. NOTE: A manual refresh of the page is required since this is happening async in the background.', 'success');
    }
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

window.reporting_fields = {};
function getSupportedReportFields(){
  var fields = getRequestObject('/reports/builder/fields', null, 'GET');
  fields.done(function(fieldsObject){
    //Store this as a global object so it can also be added to the report builder without making the request again
    window.reporting_fields.computer = fieldsObject.computer;
    window.reporting_fields.mobile = fieldsObject.mobile;
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function formatDate(date) {
  return date.getMonth()+1 + "/" + date.getDate() + "/" + date.getFullYear();
}

function attemptDestroyTable(tableName){
  //Destroy an existing table if there is one
  if ($.fn.DataTable.isDataTable('#' + tableName)) {
    $('#' + tableName).dataTable().fnDestroy();
    $('#' + tableName).empty();
  }
}

function getAllSavedReports(){
  var reports = getRequestObject('/reports/', null, 'GET');
  reports.done(function(reportsList){
    //Create an instance of the report for both computers and mobile
    var computerReports = $("#saved-computer-reports-table").DataTable();
    var mobileReports = $("#saved-mobile-reports-table").DataTable();
    //Clear out the table if it already was rendered
    computerReports.clear();
    mobileReports.clear();
    for (var i = 0; i < reportsList.length; i++){
      var actionButtons = '<button type="button" class="btn btn-success btn-circle" onclick="viewReportResults(\''+reportsList[i].id+'\');"><i class="fa fa-play-circle"></i></button>&nbsp;&nbsp;<button type="button" onclick="editReportById(\''+reportsList[i].id+'\');" class="btn btn-warning btn-circle"><i class="fa fa-pencil-alt"></i></button>&nbsp;&nbsp;<button onclick="deleteReport(\''+reportsList[i].id+'\');" type="button" class="btn btn-danger btn-circle"><i class="fa fa-times"></i></button>&nbsp;&nbsp;';
      if (reportsList[i].type == 'computer'){
        computerReports.row.add([reportsList[i].name, formatDate(new Date(reportsList[i].created)), reportsList[i].email, reportsList[i].conditions_count, actionButtons]).draw(false);
      } else {
        mobileReports.row.add([reportsList[i].name, formatDate(new Date(reportsList[i].created)), reportsList[i].email, reportsList[i].conditions_count, actionButtons]).draw(false);
      }
    }
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function editReportById(reportId){
  reloadReportPane(false);
  $("#existing-report-id").val(reportId);
  //Make the request to the server to get a saved report
  var report = getRequestObject('/reports/id/' + reportId, null, 'GET');
  report.done(function(reportObject){
    //Load the existing report view
    $("#new-report-parent").show();
    addMultipleReportLineItems(reportObject.line_items);
    //Fill in and show the fields to select
    var fieldsToSelectArr = reportObject.fields_to_select.split(',').map(item => {
      return item.trim()
    })
    $('#fields-to-select').selectpicker('val', fieldsToSelectArr);
    $("#fields-to-select").selectpicker("refresh");
    //Show the new report UI
    changeReportView('computer', 'edit');
    $("#report-name-field").html(reportObject.name);
    $("#new-report-name").val(reportObject.name);
    $("#existing-report-id").val(reportId)
    updateQueryStringParam('reportId',reportId);
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function runExistingReportByUrl(){
  //get the report id from the url
  urlParams = new URLSearchParams(window.location.search);
  reportId = urlParams.get('reportId');
  if (reportId == null){
    swal('Save Failed.', 'Unable to load an existing report Id.', 'error');
    return;
  }
  viewReportResults(reportId);
}

function upsertReport(runReport){
  //Check if their is an existing report id loaded into the UI and it should be a save
  if ($("#existing-report-id").val() != ''){
    updateExistingReport();
  } else {
    saveNewReport(runReport);
  }
}

function updateExistingReport(){
  var reportId = $("#existing-report-id").val();
  if (reportId == '' || reportId == null){
    swal('Save Failed.', 'Unable to load an existing report Id.', 'error');
    return;
  }
  //keep a list of all of the search line items to send to the server
  var lineItems = [];
  //for every line item, build an object
  for (var i = 0; i <= window.advanced_search_line_item_count-1; i++){
    //Make sure a header field wasn't selected
    if ($("#field-value-" + i).val() == '' || $("#field-value-" + i).val().includes('---')){
      swal('Save Failed.', 'It looks like one of your selected fields was a header field. Please select a field to display and save the report again.', 'error');
      return;
    }
    lineItems.push({ "item_order" : i, "condition" : $("#include-value-" + i).val(), "parenthesis_one" : $("#param-one-value-" + i).val(), "operator" : $("#operator-value-" + i).val(), "value" : $("#input-value-" + i).val(), "field" : $("#field-value-" + i).val(), "parenthesis_two" : $("#param-two-value-" + i).val()});
  }
  //Try to get report type
  urlParams = new URLSearchParams(window.location.search);
  var reportType = "mobile_device";
  if (urlParams.has('reportType')){
    reportType = urlParams.get('reportType');
  }
  //Create the report object and post everything to the server
  var reqBody = { name : $("#new-report-name").val(), type: reportType, line_items : lineItems,fields_to_select : $("#fields-to-select").val().join(", ")};
  console.log(reqBody);
  var post = getRequestObject('/reports/update/' + reportId, reqBody, 'PUT');
  post.done(function(res){
    swal('Report Saved', 'The report has been saved.', 'success');
    //Reset the new report div and reload the table with the new report
    //Reset the new report div and reload the table with the new report
    reloadReportPane(true);
    //Change views back to report list
    if (reportType == 'computer'){
      changeView('computer-reports-view');
    } else if (reportType == 'mobile_device'){
      changeView('mobile-reports-view');
    }
  })
  .fail(function(xhr){
    swal('Save Failed.', 'The report has not been saved.', 'error');
  })
}

function removeLineItemByIndex(index){
  $(".report-line-item-row-" + index).remove();
  //Now loop through every element after i and update it's 'id' so we don't have a missing one
  for (i = index; i <= window.advanced_search_line_item_count; i++){
    $(".report-line-item-row-" + i).removeClass('report-line-item-row-' + i).addClass("report-line-item-row-" + (i - 1));
    $("#param-one-value-" + i).attr('id',"param-one-value-" + (i - 1));
    $("#field-value-" + i).attr('id',"field-value-" + (i - 1));
    $("#operator-value-" + i).attr('id',"operator-value-" + (i - 1));
    $("#input-value-" + i).attr('id',"input-value-" + (i - 1));
    $("#param-two-value-" + i).attr('id',"param-two-value-" + (i - 1));
    $("#remove-line-item-button-" + i).attr('id',"remove-line-item-button-" + (i - 1));
  }
  window.advanced_search_line_item_count--;
}

function saveNewReport(shouldRun){
  if ($("#fields-to-select").val().length == 0){
    swal('Save Failed.', 'Please select some fields to be displayed in this report.', 'error');
    return;
  }
  if ($("#new-report-name").val() == ''){
    swal('Save Failed.', 'Please provide a report name.', 'error');
    return;
  }
  //keep a list of all of the search line items to send to the server
  var lineItems = [];
  //for every line item, build an object
  for (var i = 0; i <= window.advanced_search_line_item_count-1; i++){
    //Make sure a header field wasn't selected
    if ($("#field-value-" + i).val() == '' || $("#field-value-" + i).val().includes('---')){
      swal('Save Failed.', 'It looks like one of your selected fields was a header field. Please select a field to display and save the report again.', 'error');
      return;
    }
    lineItems.push({ "item_order" : i, "condition" : $("#include-value-" + i).val(), "parenthesis_one" : $("#param-one-value-" + i).val(), "operator" : $("#operator-value-" + i).val(), "value" : $("#input-value-" + i).val(), "field" : $("#field-value-" + i).val(), "parenthesis_two" : $("#param-two-value-" + i).val()});
  }
  //Try to get report type
  urlParams = new URLSearchParams(window.location.search);
  var reportType = "mobile_device";
  console.log(urlParams.get('reportType'));
  if (urlParams.has('reportType')){
    reportType = urlParams.get('reportType');
  }
  //Create the report object and post everything to the server
  var reqBody = { name : $("#new-report-name").val(), type : reportType, line_items : lineItems, fields_to_select : $("#fields-to-select").val().join(", ")};
  var post = getRequestObject('/reports/save', reqBody, 'POST');
  post.done(function(res){
    swal('Report Saved', 'The report has been saved.', 'success');
    //Reset the new report div and reload the table with the new report
    reloadReportPane(true);
    //Change views back to report list
    if (reportType == 'computer'){
      changeView('computer-reports-view');
    } else if (reportType == 'mobile_device'){
      changeView('mobile-reports-view');
    }
    //If we should run report, do so now
    if (shouldRun){
      viewReportResults(res.id);
    }
  })
  .fail(function(xhr){
    swal('Save Failed.', 'The report has not been saved.', 'error');
  })
}

function reloadReportPane(loadFirstItem){
  //hide the new report view
  $('#new-report-div').hide();
  //Clear out the existing report id in case one was added
  $("#existing-report-id").val('');
  //reset selected fields
  $("#new-report-name").val('New Report Name');
  $("#new-report-parent").show();
  //reload the saved reports from the server
  getAllSavedReports();
  //Remove the report line items and clear the name field
  $("#advance-report-criteria").html('');
  $("#new-report-name").val('');
  //Add a new blank line item
  window.advanced_search_line_item_count = 0;
  if (loadFirstItem){
    addReportLineItem(null);
  }
}

function prettyPrintColumnName(input){
  //First replace the periods with dashes
  var pretty = input.replace('.', ' - ');
  //Now replace underscores with spaces
  pretty = pretty.replace('_', ' ');
  return pretty.toLowerCase()
      .split(' ')
      .map((s) => s.charAt(0).toUpperCase() + s.substring(1))
      .join(' ');
}

function exportReport(reportId) {
  $.Toast.showToast({
    "title": "Building report... Some larger reports may take awhile to load.",
    "icon": "loading",
    "duration": 60000
  });
  var getReport = getRequestObject('/reports/export/' + reportId, null, 'POST');
  getReport.done(function(res){
    $.Toast.hideToast();
      swal('Exported!', 'Find your report here: ' + res.path, 'success');
  })
  .fail(function(xhr){
    $.Toast.hideToast();
    swal('Error!', 'There was an error writing your report.', 'error');
    console.log(xhr);
  });
}

function viewReportResults(reportId){
  $.Toast.showToast({
    "title": "Calculating report results... Some larger reports may take several seconds to load.",
    "icon": "loading",
    "duration": 60000
  });
  var getReport = getRequestObject('/reports/search/' + reportId, null, 'GET');
  getReport.done(function(res){
    console.log(res);
    //Create a table in the modal based on the fields to be shown
    var columns = res.fields_to_select.split(",");
    var columnsObjs = [];
    columns.forEach(function(c){
      columnsObjs.push({title : prettyPrintColumnName(c)});
    });
    //Destroy an existing table if there is one
    if ($.fn.DataTable.isDataTable('#report-results-table')) {
      $("#report-results-table").dataTable().fnDestroy();
      $('#report-results-table').empty();
    }
    //Now load the report since any existing is destroyed
    var resultTable = $("#report-results-table").DataTable({
      columns : columnsObjs
    });
    //For each line item of the report, add it to the display modal
    for (var i = 0; i < res.results.length; i++){
      //Check if it's a computer or mobile device
      var deviceType = getKeyForDeviceObj(res.results[i]);
      var row = [];
      columns.forEach(function(c){
        c = c.replace(/\s/g,'');
        var parentCategory = c.split(".")[0];
        var dataCategory = c.split(".")[1];
        row.push(res.results[i][deviceType][parentCategory][dataCategory]);
      });
      //Add a row for the device to the table
      resultTable.row.add(row);
    }
    $("#export-report-button").attr('onclick', 'exportReport('+reportId+');')
    //Draw the table and show the results modal
    resultTable.draw(false);
    changeView('reports-results-view');
    updateQueryStringParam('reportId', reportId);
    updateQueryStringParam('type', 'view');
    $.Toast.hideToast();
    //$("#report-display-modal").modal('show');
  })
  .fail(function(xhr){
    console.log(xhr);
  })
}

function getKeyForDeviceObj(obj){
  var key = "computer";
  //Default to computer, if it has a mobile_device key, then go with that
  if ('mobile_device' in obj){
    key = 'mobile_device';
  }
  return key;
}

function doAdvancedSearch(){
  //keep a list of all of the search line items to send to the server
  var lineItems = [];
  //for every line item, build an object
  for (var i = 0; i <= window.advanced_search_line_item_count; i++){
    lineItems.push({ "junction" : $("#include-value-" + i).val(), "param-one" : $("#param-one-value-" + i).val(), "operator" : $("#operator-value-" + i).val(), "value" : $("#input-value-" + i).val(), "field" : $("#field-value-" + i).val(), "param-two" : $("#param-two-value-" + i).val()});
  }
  //Post the object to the server
  var reqBody = { search_line_items : lineItems};
  var post = getRequestObject('/reports/search', reqBody, 'POST');
  post.done(function(res){
    console.log(res);
  })
  .fail(function(xhr){
    console.log(xhr);
  })
}

function addServerToDatabase(url,username,password,cronLimited,cronExpanded){
  var serverObject = { "url" : url, "username" : username, "password" : password, "cronLimited" : cronLimited, "cronExpanded" : cronExpanded};
  $.Toast.showToast({
    "title": "Attempting to contact Jamf Pro Server...",
    "icon": "loading",
    "duration": 15000
  });
  $('#add-server-modal').modal('hide');
  //send it to the server
  var post = getRequestObject('/servers/add', serverObject, 'POST');
  post.done(function(data, textStatus, jqXHR){
    $.Toast.hideToast();
    if (jqXHR.status == 206 && jqXHR.responseText.includes("cron")){
      swal('Server Added', 'The server has been added, but we were unable to verify the server cron jobs. Please restart the server to fix this.', 'warning');
    } else if (jqXHR.status == 206 && jqXHR.responseText.includes("scout admin user")){
      swal('Server Added', 'The server has been added, but we were unable add the scout admin user. Emergency access has been disabled for this server.', 'warning');
    } else {
      swal('Server Added', 'The server has been added.', 'success');
    }
    refreshAllDevices(false);
    loadServerTable();
  })
  .fail(function(jqXHR, textStatus, errorThrown){
    console.log(jqXHR);
    console.log(textStatus);
    console.log(errorThrown);
    $.Toast.hideToast();
    swal('Server Upload Failed', 'The server has not been added to the database, please check the console for more details.', 'error');
  })
}

function updateServer(id,url){
  //Fill in some modal details
  $("#update-server-url").val(url);
  $("#update-server-id").val(id);
  $("#update-server-username").val('');
  $("#update-server-modal").modal('show');
}

function doUpdateServer(){
  //Make sure the id is filled out
  if ($("#update-server-id").val() == ''){
    swal('Server Update Failed', 'No server Id was passed to the update function.', 'error');
    return;
  }
  $.Toast.showToast({
    "title": "Attempting to contact Jamf Pro Server...",
    "icon": "loading",
    "duration": 15000
  });
  //Check which fields changed
  var updateObject = {};
  if ($("#update-server-username").val() != ''){
    updateObject.username = $("#update-server-username").val();
  }
  if ($("#update-server-password").val() != ''){
    updateObject.password = $("#update-server-password").val();
  }
  if ($("#update-server-limited-cron").val() != '' && $("#update-server-limited-cron").val() != '* * * * *'){
    updateObject.cron_update = $("#update-server-limited-cron").val();
  }
  if ($("#update-server-expanded-cron").val() != '' && $("#update-server-expanded-cron").val() != '* * * * *'){
    updateObject.cron_update_expanded = $("#update-server-expanded-cron").val();
  }
  //Make sure an update is actually being made
  if (Object.keys(updateObject).length > 0){
    var put = getRequestObject('/servers/update/' + $("#update-server-id").val(), updateObject, 'PUT');
    put.done(function(data, textStatus, jqXHR){
      $.Toast.hideToast();
      swal('Server Updated', 'The server has been updated.', 'success');
      $("#update-server-modal").modal('hide');
      loadServerTable();
    })
    .fail(function(jqXHR, textStatus, errorThrown){
      console.log(jqXHR);
      console.log(textStatus);
      console.log(errorThrown);
      $("#update-server-modal").modal('hide');
      $.Toast.hideToast();
      swal('Server Update Failed', 'The server update failed.', 'error');
    })
  } else {
    $.Toast.hideToast();
    swal('Server Update Failed', 'No fields have been specified to update.', 'error');
  }
}

function addPatchServerToDatabase(url,cron){
  var serverObject = { "url" : url, "cron" : cron};
  //send it to the server
  var post = getRequestObject('/patches/create', serverObject, 'POST');
  post.done(function(res){
    $('#add-patch-server-modal').modal('hide');
    swal('Server Added', 'The server has been addded to the database successfully.', 'success');
    loadServerTable();
  })
  .fail(function(xhr){
    swal('Server Upload Failed', 'The server has not been added to the database, please check the console for more details.', 'error');
    console.log(xhr);
  })
}

function prettyPrintKey(input){
  //First replace the underscores with spaces
  var pretty = input.replace(/_/g, ' ');
  return pretty.toLowerCase()
      .split(' ')
      .map((s) => s.charAt(0).toUpperCase() + s.substring(1))
      .join(' ');
}

//A bunch of custom parsers for values that are nested
function parseToTableValue(prop, object){
  if (prop == 'remote_management'){
    return 'Managed: ' + object.managed;
  } else {
    return JSON.stringify(object);
  }
}

function getDeviceLive(type, serial, udid){
  //Show a loading notification
  $.Toast.showToast({
    "title": "Getting device from Jamf Pro server...",
    "icon": "loading",
    "duration": 10000
  });
  //Lookup device by serial and UDID
  var reqBody = { serial : serial, udid : udid};
  //Get expanded inventory from server
  var liveResult = getRequestObject('/devices/live/' + type, reqBody, 'POST');
  liveResult.done(function(result){
    console.log(result);
    //Get the view to inject into the modal
    $.get("/app-views/device-view.html", function(data) {
      $("#device-pane-view").html(data);
      //Start filling in the tables by key
      var device;
      if (type == "computer"){
        device = result.computer;
      } else {
        device = result.mobile_device;
      }
      $("#device-view-name").html("<h4>"+device.general.name+"</h4>");
      for (var prop in device) {
        if (!device.hasOwnProperty(prop)) {
           continue;
        }
        //Three values for the extension attributes
        if (prop == 'extension_attributes'){
          //If there are some to display
          if (device[prop].length > 0){
            for (var i = 0; i < device[prop].length; i++) {
              //Add a line item to the table
              $("#extension_attributes-table-body").append("<tr><td>"+device[prop][i]["name"]+"</td><td>"+device[prop][i]["type"]+"</td><td>"+device[prop][i]["value"]+"</td></tr>");
            }
          }
        } else if (prop == 'certificates'){
          //If there are some to display
          if (device[prop].length > 0){
            for (var i = 0; i < device[prop].length; i++) {
              //Add a line item to the table
              $("#certificates-table-body").append("<tr><td>"+device[prop][i]["common_name"]+"</td><td>"+device[prop][i]["identity"]+"</td><td>"+device[prop][i]["expires_utc"]+"</td></tr>");
            }
          }
        } else if (prop == 'configuration_profiles'){
          //If there are some to display
          if (device[prop].length > 0){
            for (var i = 0; i < device[prop].length; i++) {
              //Add a line item to the table
              $("#configuration_profiles-table").append("<tr><td>"+device[prop][i]["name"]+"</td><td>"+device[prop][i]["uuid"]+"</td><td>"+device[prop][i]["is_removable"]+"</td></tr>");
            }
          }
        } else
        //If there is a length object, it's a list type
        if (device[prop].length == undefined){
          //Get the table for the given key
          var tableTab = prop + "-table-body";
          //if (tableTab == "general-table-body"){
            //For every key in this value, add a row to the table
            for (var value in device[prop]) {
              if (typeof device[prop][value] === 'object'){
                  $("#" + tableTab).append("<tr><td>"+prettyPrintKey(value)+"</td><td>"+parseToTableValue(value,device[prop][value])+"</td></tr>");
              } else {
                $("#" + tableTab).append("<tr><td>"+prettyPrintKey(value)+"</td><td>"+device[prop][value]+"</td></tr>");
              }
            }
        } else if (device[prop].length == 0){
          //No values
          var tableTab = prop + "-table-body";
          $("#" + tableTab).append("<tr><td>No Values</td><td>No Data</td></tr>");
        }
      }
      //Show the modal
      //$("#device-display-modal").modal('show');
      //Change the page to the device view
      changeView('full-device-view');
      $.Toast.hideToast();
      updateQueryStringParam('type',type);
      updateQueryStringParam('serial',serial);
      updateQueryStringParam('udid',udid);
    });
  })
  .fail(function(xhr){
    $.Toast.hideToast();
    $.Toast.showToast({
      "title": "Unable to contact server or find device",
      "icon": "error",
      "duration": 5000
    });
  });
}

function updateComputers(){
  var computerTable = $("#computers-table").DataTable(getDataTablesRequest('computer'));
  computerTable.on( 'select', function ( e, dt, type, indexes ) {
    var rows = computerTable.rows( { selected: true } ).data();
    //If something is selected
    if (rows.length > 0){
      $("#send-computer-command-button").show();
    } else {
      $("#send-computer-command-button").hide();
    }
  });
  getComputerCount();
}

function getComputerCount() {
  var computers = getRequestObject('/devices/count/computer', null, 'GET');
  //Get a count of the total devices seperate since data tables can't handle success functions
  computers.done(function(computers){
    $("#macos-device-count").html(computers.size);
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function updateTvs(){
  var tvsTable = $("#tvs-table").DataTable(getDataTablesRequest('tv'));
  getTvCount();
}

function getTvCount() {
  var tvs = getRequestObject('/devices/count/tv', null, 'GET');
  //Get a count of the total devices seperate since data tables can't handle success functions
  tvs.done(function(tvs){
    $("#tvos-device-count").html(tvs.size);
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function updateMobileDevices(){
  attemptDestroyTable("mobiledevices-table");
  var mobileTable = $("#mobiledevices-table").DataTable(getDataTablesRequest('mobile'));
  //check if we should show the mdm command buttons
  mobileTable.on( 'select', function ( e, dt, type, indexes ) {
    var rows = mobileTable.rows( { selected: true } ).data();
    //If something is selected
    if (rows.length > 0){
      $("#send-mobile-command-button").show();
    } else {
      $("#send-mobile-command-button").hide();
    }
  });
  getMobileDeviceCounts();
}

function getMobileDeviceCounts(){
  var mobile = getRequestObject('/devices/count/mobile', null, 'GET');
  //Get a count of the total devices seperate since data tables can't handle success functions
  mobile.done(function(mobiledevices){
    $("#ios-device-count").html(mobiledevices.size);
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function verifyEraseDevices(){
  //Make sure they added a password to confirm
  var password = $("#erase-devices-confirm-password").val();
  if (password == null || password == ''){
    swal('Error', 'A password must be provided.', 'error');
    return;
  }
  //Verify the provided password is correct
  var reqBody = { password : password};
  var userVerify = getRequestObject('/users/verify', reqBody, 'POST');
  userVerify.done(function(res){
    if (res.verified){
      //Do the MDM command
      var options = {};
      createMDMCommand('iOS', 'EraseDevice', options);
      $("#erase-devices-modal").modal('hide');
    } else {
      $("#erase-devices-modal").modal('hide');
      swal('Error', 'Unable to verify password, or user is not an admin.', 'error');
    }
  })
  .fail(function(xhr){
    console.log(xhr);
    swal('Error', 'Unable to verify password, or user is not an admin.', 'error');
  });
}

function verifyDeleteServer(){
  var serverId = $("#delete-server-id").val();
  if (serverId == null || serverId == ''){
    swal('Error', 'Missing server id, unable to remove server.', 'error');
    return;
  }
  //Make sure they added a password to confirm
  var password = $("#delete-server-confirm-password").val();
  if (password == null || password == ''){
    swal('Error', 'A password must be provided.', 'error');
    return;
  }
  //Verify the provided password is correct
  var reqBody = { password : password};
  var userVerify = getRequestObject('/users/verify', reqBody, 'POST');
  userVerify.done(function(res){
    if (res.verified){
      //Do the server delete
      deleteServer(serverId);
    } else {
      swal('Error', 'Unable to verify password.', 'error');
    }
  })
  .fail(function(xhr){
    console.log(xhr);
    swal('Error', 'Unable to verify password.', 'error');
  });
}

function deleteServer(id){
  //Make the user auth again before deleting the server
  var serverDelete = getRequestObject('/servers/delete/' + id.toString(), null, 'DELETE');
  serverDelete.done(function(data, textStatus, jqXHR){
    if (jqXHR.status == 206 && jqXHR.responseText.includes("ScoutAdmin")){
      swal('Server Deleted', 'The server and all of it\'s devices have been removed. Note: ScoutAdmin could not be found or deleted. This may require manual cleanup.', 'success');
    } else if (jqXHR.status == 206 && jqXHR.responseText.includes("cron")){
      swal('Server Deleted', 'The server and all of it\'s devices have been removed. Note: Scout could not clean up your cron jobs automatically. Please clean these up manually.', 'success');
    } else {
      swal('Server Deleted', 'The server and all of it\'s devices have been removed. The ScoutAdmin user has also been deleted.', 'success');
    }
    loadServerTable();
    $("#remove-server-modal").modal('hide');
  })
  .fail(function(xhr){
    $("#remove-server-modal").modal('hide');
    swal('Error', 'There was an error deleting your server. This may require manual database cleanup if the devices or the server was not removed.', 'error');
  });
}

function getServerAccess(id,url){
  $("#get-server-access-key").modal('show');
  $("#backup_password_url").val(url);
}

function deleteDevicesByScoutId(serverId) {
  swal({
    title: "Confirm Delete Devices",
    text: "Deleting these devices will only remove it from the Scout database, not from the the Jamf Pro Server. It may repopulate following the next inventory update if it's still in the Jamf Pro Server. This can NOT be undone.",
    icon: "warning",
    buttons: true,
    dangerMode: true
  })
  .then((willDelete) => {
    if (willDelete){
      var deleteRequest = getRequestObject('/servers/delete/devices/'+serverId, null, 'DELETE');
      //render the table after the servers are loaded from the DB
      deleteRequest.done(function(response){
        swal('Server devices deleted', 'The devices have been removed from scout. You may need to refresh the page for the scout counts to update properly.', 'success');
        updateMobileDevices();
        updateComputers();
        updateTvs();
      })
      .fail(function(xhr) {
        if (xhr.status == 403){
          swal('No Permissions', 'Your user does not have permission to delete devices from scout.', 'error');
        } else {
          console.log(xhr);
          swal('Delete Failed', 'Unable to delete devices from scout. Check the console for more details.', 'error');
        }
      });
    }
  });
}

function getServerButtons(id,url){
  // Only show server accesss buttons for admins
  if (sessionStorage.getItem("is_admin") == 'true') {
      return '<button onclick="updateServer(\''+id+'\',\''+url+'\');" type="button" id="edit_'+id+'" class="edit_server btn btn-info btn-circle"><i class="fa fa-pencil-alt"></i></button>&nbsp;&nbsp;<button type="button" id="delete_'+id+'" onclick="$(\'#remove-server-modal\').modal(\'show\');$(\'#delete-server-id\').val('+id+');" class="btn btn-danger delete_server btn-circle"><i class="fa fa-times"></i></button>&nbsp;&nbsp;<button type="button" id="access'+id+'" onclick="getServerAccess(\''+id+'\',\''+url+'\')" class="btn btn-success delete_server btn-circle"><i class="fa fa-key"></i></button>&nbsp;&nbsp;<button onclick="deleteDevicesByScoutId(\''+id+'\');" type="button" class="btn btn-danger btn-circle"><i class="fa fa-broom"></i></button>';
  }
  return '<button onclick="updateServer(\''+id+'\',\''+url+'\');" type="button" id="edit_'+id+'" class="edit_server btn btn-info btn-circle"><i class="fa fa-pencil-alt"></i></button>&nbsp;&nbsp;<button type="button" id="delete_'+id+'" onclick="$(\'#remove-server-modal\').modal(\'show\');$(\'#delete-server-id\').val('+id+');" class="btn btn-danger delete_server btn-circle"><i class="fa fa-times"></i></button>&nbsp;&nbsp;<button onclick="deleteDevicesByScoutId(\''+id+'\');" type="button" class="btn btn-danger btn-circle"><i class="fa fa-broom"></i></button>';
}

function loadServerTable(){
  var serverTable = $("#server-table").DataTable();
  serverTable.clear();
  var servers = getRequestObject('/servers', null, 'GET');
  //render the table after the servers are loaded from the DB
  servers.done(function(servers){
    $("#server-count").html(servers.servers.length);
    //Add to the server table
    for (i = 0; i < servers.servers.length; i++){
      var s = servers.servers[i];
      serverTable.row.add( [s.url, s.username, s.org_name, s.ac, s.cronLimited, s.cronExpanded,getServerButtons(s.id,s.url) ] );
    }
    serverTable.draw();
  })
  .fail(function(xhr) {
    console.log(xhr);
  })
}

function loadPatchesTable(){
  var patchesTable = $("#patches-table").DataTable();
  patchesTable.clear();
  var patches = getRequestObject('/patches/software', null, 'GET');
  //render the table after the servers are loaded from the DB
  patches.done(function(patchList){
    //Add to the server table
    for (i = 0; i < patchList.length; i++){
      patchesTable.row.add([patchList[i].name, patchList[i].publisher,patchList[i].id,patchList[i].currentVersion,patchList[i].lastModified]);
    }
    patchesTable.draw();
  })
  .fail(function(xhr) {
    console.log(xhr);
  })
}

function loadPatchServersTable(){
  var patchServersTable = $("#patch-servers-table").DataTable();
  patchServersTable.clear();
  var patchServers = getRequestObject('/patches/servers', null, 'GET');
  //render the table after the servers are loaded from the DB
  patchServers.done(function(patchServerList){
    //Add to the server table
    for (i = 0; i < patchServerList.length; i++){
      patchServersTable.row.add([patchServerList[i].base_url, patchServerList[i].cron_update]);
    }
    patchServersTable.draw();
  })
  .fail(function(xhr) {
    console.log(xhr);
  })
}

window.devices_to_send_mdm_commands = [];
window.platform_to_send_commands_to = '';
function viewMDMCommands(type){
  var table = $("#" + type).DataTable();
  //Get the selected rows
  var rows = table.rows( { selected: true } ).data();
  //save the devices to send to
  window.devices_to_send_mdm_commands = [];
  for (var i = 0; i < rows.length; i++){
    window.devices_to_send_mdm_commands.push(rows[i]);
  }
  //Select the platform to send mdm commands to to make sure we are sending to the right type
  window.platform_to_send_commands_to = type;
  if (type == 'computers-table'){
    $("#selected-computer-count").html(rows.length);
    //show them the possible commands
    changeView('computer-commands-view');
  } else {
    $("#selected-devices-count").html(rows.length);
    //show them the possible commands
    changeView('mobile-commands-view');
  }
}

function createMDMCommand(deviceType, mdmCommand, options){
  var platform = 'computer';
  if (deviceType.includes('mobile')){
    platform = 'mobile_device';
  }
  $.Toast.showToast({
    "title": "Waiting for a response from the Jamf Pro Servers... This could take a bit if there are a lot of servers.",
    "icon": "loading",
    "duration": 60000
  });
  var devicesObj = { mdmCommand : mdmCommand, deviceType : deviceType, deviceList : window.devices_to_send_mdm_commands, options : options};
  var req = getRequestObject('/commands/create/'+platform, devicesObj, 'POST');
  req.done(function(data){
    $.Toast.hideToast();
    swal("The MDM Commands are on their way! They may take a few minutes to complete.", {
      icon: "success",
    });
  })
  .fail(function(xhr){
    $.Toast.hideToast();
    //Show some better error handling for MDM Commands
    console.log(xhr.responseJSON.error);
    if ('error' in xhr.responseJSON){
      $("#mdm-error-server-url").text(xhr.responseJSON.error.url);
      $("#mdm-error-req-data").text(xhr.responseJSON.error.req_data);
      $("#mdm-error-res-data").html(xhr.responseJSON.error.res_data);
      $("#mdm-error-message").modal('show');
    } else {
      swal("The MDM Commands failed to send. Check the console for more details.", {
        icon: "error",
      });
    }
    console.log(xhr);
  });
}

function deleteDeviceByScoutId(deviceId) {
  swal({
    title: "Confirm device deletion",
    text: "Deleting this device will only remove it from the Scout database, not from the the Jamf Pro Server. It may repopulate following the next inventory update if it's still in the Jamf Pro Server.",
    icon: "warning",
    buttons: true,
    dangerMode: true
  })
  .then((willDelete) => {
    if (willDelete){
      var deleteRequest = getRequestObject('/devices/id/'+deviceId, null, 'DELETE');
      //render the table after the servers are loaded from the DB
      deleteRequest.done(function(response){
        swal('Device Removed', 'The device has been removed from scout.', 'success');
        updateMobileDevices();
        updateTvs();
      })
      .fail(function(xhr) {
        if (xhr.status == 401){
          swal('No Permissions', 'Your user does not have permission to delete devices from scout.', 'error');
        } else {
          console.log(xhr);
          swal('Delete Failed', 'Unable to delete device from scout. Check the console for more details.', 'error');
        }
      });
    }
  })
}

function sendMDMCommand(deviceType, mdmCommand){
  if (window.devices_to_send_mdm_commands.length == 0){
    swal('Send Failed', 'No devices have been selected.', 'error');
    if (deviceType == 'computer'){
      changeView('macos-view');
    } else {
      changeView('ios-view');
    }
    return;
  }
  //Prompt to ensure they actually want to send the command
  swal({
    title: "Are you sure?",
    text: "Once the MDM Commands have been sent to the various Jamf Pro Servers, this can not be undone. Are you sure you'd like to send this command to " + window.devices_to_send_mdm_commands.length + " devices?",
    icon: "warning",
    buttons: true,
    dangerMode: true,
  })
  .then((willSend) => {
    if (willSend) {
      var options = {};
      //Verify a admin password if it's an erease device command
      if (mdmCommand == 'EraseDevice'){
        $("#erase-devices-modal").modal('show');
      // These commands require some more innput
      } else if (mdmCommand == 'DeviceName' || mdmCommand == 'DeleteUser' || mdmCommand == 'DeviceLock' || mdmCommand == 'UnlockUserAccount' || mdmCommand == 'EnableLostMode'){
        var title = 'Provide Device Name';
        var key = 'user_name';
        if (mdmCommand == 'DeleteUser' || mdmCommand == 'UnlockUserAccount'){
          title = 'Provide User Name';
        } else if (mdmCommand == 'DeviceLock'){
          title = 'Provide a 6 character passcode';
          key = 'passcode';
        } else if (mdmCommand == 'EnableLostMode'){
          title = 'Provide a message to be displayed on the device';
          key = 'lost_mode_message';
        }
        openMDMPrompt(deviceType, title, key, mdmCommand);
      } else {
        createMDMCommand(deviceType, mdmCommand, options);
      }
    } else {
      swal("No commands have been sent.");
    }
  });
}

function openMDMPrompt(deviceType, title, key, mdmCommand){
  $(".mdm-command-prompt-title").html(title);
  $("#mdm-command-prompt-device-type").html(deviceType);
  //Setup the button to process the command
  $("#send-command-button").attr('onclick', 'doMDMCommandPromptInput(\''+deviceType+'\',\''+key+'\',\''+mdmCommand+'\');');
  $("#mdm-prompt-input-value").attr('placeholder', title);
  //Open the modal
  $("#mdm-command-prompt").modal('show');
}

function doMDMCommandPromptInput(deviceType, key, mdmCommand){
  //Make sure something was filled out
  if ($("#mdm-prompt-input-value").val() == ''){
    swal({
      title: "Required Field",
      text: "Please enter a value in the field before continuing..",
      icon: "warning",
      buttons: true,
      dangerMode: true,
    })
    .then((shouldReenter) => {
      if (shouldReenter) {
        $("#mdm-command-prompt").modal('show');
      }
    });
  } else {
    //Build the options for the request object
    var options = {};
    options[key] = $("#mdm-prompt-input-value").val();
    createMDMCommand(deviceType, mdmCommand, options);
  }
}

function doLoginLDAP(){
  var loginObj = {"username" : $("#login-username").val(), "password" : $("#login-password").val()};
  var req = getRequestObject('/users/login/ldap', loginObj, 'POST');
  req.done(function(data){
    sessionStorage.setItem("auth_token", data.token);
    $('#login-modal').modal('hide');
    renderPage();
  })
  .fail(function(xhr){
    $(".login-group").addClass("has-error");
  })
}

function doBackupPasswordRequest(){
  var body = { "url" : $("#backup_password_url").val()};
  var backupRequest = getRequestObject('/servers/access/', body, 'POST');
  //render the table after the servers are loaded from the DB
  backupRequest.done(function(response){
    swal('Password Retrieved', 'Your emergency password is: ' + response.password + ' . Do not loose this, as it has now been removed from the database and can no longer be returned.', 'warning');
    $('#get-server-access-key').modal('hide');
  })
  .fail(function(xhr) {
    if (xhr.status == 503){
      swal('Feature Disabled', 'The scout emergency feature has been disabled. Before re-enabling it, you must delete any existing ScoutAdmin user in your JPS.');
    } else {
      swal('Password Retrieve Failed', 'Unable to retrieve emergency password. If this a real emergency, get the password from the database and decrypt it using your private key set upon Scout setup.', 'error');
    }
  })
}

function doLoginUserPass(){
  console.log('login');
  $(".login-group").removeClass("has-error");
  var loginObj = {"email" : $("#login-user-username").val(), "password" : $("#login-user-password").val()};
  var req = getRequestObject('/users/login/basic', loginObj, 'POST');
  req.done(function(data){
    console.log(data);
    sessionStorage.setItem("auth_token", data.token);
    $('#login-user-modal').modal('hide');
    if (data.is_admin == 1){
      sessionStorage.setItem("is_admin", true);
    } else {
      sessionStorage.setItem("is_admin", false);
    }
    renderPage();
    changeView('dashboard-view');
  })
  .fail(function(xhr){
    console.log(xhr);
    sessionStorage.setItem("is_admin", false);
    $(".login-group").addClass("has-error");
  })
}

function registerUser(){
  $(".login-group").removeClass("has-error");
  var loginObj = {"email" : $("#register-email").val(), "password" : $("#register-password").val(), "register_pin" : $("#register-pin").val()};
  var req = getRequestObject('/users/create', loginObj, 'POST');
  req.done(function(data){
    sessionStorage.setItem("auth_token", data.token);
    $('#login-user-modal').modal('hide');
    $('#register-modal').modal('hide');
    renderPage();
  })
  .fail(function(xhr){
    if (xhr.status == 400){
      swal('Register Failed', 'Missing required fields, were all of the inputs filled out? ', 'error');
    } else if (xhr.status == 401){
      swal('Register Failed', 'Incorrect register pin', 'error');
    } else if (xhr.status == 409){
      swal('Register Failed', 'User with that email already exists', 'error');
    } else if (xhr.status == 500){
      swal('Register Failed', 'There was an unkown server error, check the serer logs.', 'error');
    } else if (xhr.status == 404){
      swal('Register Failed', 'The request returned a 404, not found. Ensure the server url is set probably in the env file and the /app/js/server-url.js file.', 'error');
    }

    $(".login-group").addClass("has-error");
  })
}

function getSettingsForAdmin(){
  var req = getRequestObject('/settings/all', null, 'GET');
  req.done(function(data){
    for (var key in data){
      $("#general-settings").append(getSettingsItemHTML(key, key, data[key]));
    }
  })
  .fail(function(xhr){
    console.log(xhr);
  });
  loadUserPermissions();
}

function loadUserPermissions(){
  //Get the users from the database so those can be edited
  var userReq = getRequestObject('/users/all', null, 'GET');
  userReq.done(function(userList){
    //add users to the table
    var usersTable = $("#users-table").DataTable();
    usersTable.clear();
    userList.forEach(function(u){
      var canCreate = getUserEditButton(u.id, 'can_create', u.can_create);
      var canEdit = getUserEditButton(u.id, 'can_edit', u.can_edit);
      var canDelete = getUserEditButton(u.id, 'can_delete', u.can_delete);
      var canEditUsers = getUserEditButton(u.id, 'can_edit_users', u.can_edit_users);
      var mdmCommands = getUserEditButton(u.id, 'mdm_commands', u.mdm_commands);
      usersTable.row.add([u.email, canCreate, canEdit, canDelete, canEditUsers, mdmCommands]).draw(false);
    });
  })
  .fail(function(xhr){
    console.log(xhr);
  });
}

function updatePermission(userId, permission, value){
  //build the request body
  var reqBody = { userId : userId, permission : permission, newValue : value};
  //make the request to the server
  var req = getRequestObject('/settings/user', reqBody, 'PUT');
  req.done(function(result){
    swal('Success', 'User setttings have been updated.', 'success');
    loadUserPermissions();
  })
  .fail(function(xhr){
    console.log(xhr);
    swal('Update Failed', 'Updating the user setting has failed. You may not have permission to do so.', 'error');
  });
}

function deleteReport(reportId){
  //Prompt to make sure they actually want to delete the report
  swal({
    title: "Are you sure?",
    text: "This action can not be undone.",
    icon: "warning",
    buttons: true,
    dangerMode: true,
  })
  .then((willDelete) => {
    if (willDelete) {
      var req = getRequestObject('/reports/id/' + reportId, null, 'DELETE');
      req.done(function(result){
        swal('Success', 'The report has been deleted.', 'success');
        getAllSavedReports();
      })
      .fail(function(xhr){
        console.log(xhr);
        swal('Update Failed', 'Failed to delete the report. You may not have permission to delete reports. Check the console for more details.', 'error');
      });
    }
  });
}

function getUserEditButton(userId, permission, value){
  if (value == true || value == 1){
    return '<button type="button" class="btn btn-success btn-circle" onclick="updatePermission(\''+userId+'\',\''+permission+'\',false);"><i class="fa fa-check"></i></button>';
  } else {
    return '<button type="button" class="btn btn-danger btn-circle" onclick="updatePermission(\''+userId+'\',\''+permission+'\',true);"><i class="fa fa-times"></i></button>';
  }
}

function updateSettings(){
  //For every settings input, get the id and it's value
  var newFile = {};
  $(".settings-input").each(function(i,e){
    var id = $(this).attr('id');
    var value = $(this).val();
    newFile[id] = value;
  });
  console.log(newFile);
  //Make the request to the server
  var req = getRequestObject('/settings/all', newFile, 'PUT')
  req.done(function(result){
    getOrgDetails();
    swal('Success!', 'Your settings have been saved successfully. The server MUST be restarted in order for the changes to take affect.', 'warning');
  })
  .fail(function(xhr){
    console.log(xhr);
    swal('Save Failed.', 'Unable to save settings, check the console for more details.', 'error');
  });
}

function getSettingsItemHTML(title, id, value){
  var html = '<div class="form-group">';
      html += '<label>'+title+'</label>';
      html += '<input class="form-control settings-input" id="'+id+'" value="'+value+'">';
    html += '</div>';
 return html;
}

function fillDataForLineItem(id, data){
  //Fill in all of the data
  if (data.condition != ''){
    $("#include-value-" + data.item_order).val(data.condition);
  }
  if (data.parenthesis_one != 0){
    $("#param-one-value-" + data.item_order).val('(');
  }
  if (data.parenthesis_two != 0){
    $("#param-two-value-" + data.item_order).val(')');
  }
  $("#field-value-" + data.item_order).val(data.field);
  $("#operator-value-" + data.item_order).val(data.operator);
  $("#input-value-" + data.item_order).val(data.value);
}

function getReportOptions(){
  //See if there is a report type to use
  var urlParams = new URLSearchParams(window.location.search);
  var options = [];
  if (urlParams.has('reportType') && urlParams.get('reportType') == 'mobile_device'){
      //Make sure it has the most recent fields available to it
      options.push(new Option('--- General ---',''));
      for (var key in window.reporting_fields.mobile.general){
        options.push(new Option(window.reporting_fields.mobile.general[key],"general." + key));
      }
      options.push(new Option('--- Location ---',''));
      for (var key in window.reporting_fields.mobile.location){
        options.push(new Option(window.reporting_fields.mobile.location[key],"location." + key));
      }
      options.push(new Option('--- Network ---',''));
      for (var key in window.reporting_fields.mobile.network){
        options.push(new Option(window.reporting_fields.mobile.network[key],"network." + key));
      }
      options.push(new Option('--- Purchasing ---',''));
      for (var key in window.reporting_fields.mobile.purchasing){
        options.push(new Option(window.reporting_fields.mobile.purchasing[key],"purchasing." + key));
      }
      options.push(new Option('--- Extension Attributes ---',''));
      for (var key in window.reporting_fields.mobile.extension_attributes){
        options.push(new Option(window.reporting_fields.mobile.extension_attributes[key],"extension_attributes." + key));
      }
      options.push(new Option('--- Applications ---',''));
      for (var key in window.reporting_fields.mobile.applications){
        options.push(new Option(window.reporting_fields.mobile.applications[key],"applications." + key));
      }
      options.push(new Option('--- Configuration Profiles ---',''));
      for (var key in window.reporting_fields.mobile.configuration_profiles){
        options.push(new Option(window.reporting_fields.mobile.configuration_profiles[key],"configuration_profiles." + key));
      }
  } else {
      //Make sure it has the most recent fields available to it
      options.push(new Option('--- General ---',''));
      for (var key in window.reporting_fields.computer.general){
        options.push(new Option(window.reporting_fields.computer.general[key],"general." + key));
      }
      options.push(new Option('--- Location ---',''));
      for (var key in window.reporting_fields.computer.location){
        options.push(new Option(window.reporting_fields.computer.location[key],"location." + key));
      }
      options.push(new Option('--- Purchasing ---',''));
      for (var key in window.reporting_fields.computer.purchasing){
        options.push(new Option(window.reporting_fields.computer.purchasing[key],"purchasing." + key));
      }
      options.push(new Option('--- Hardware ---',''));
      for (var key in window.reporting_fields.computer.hardware){
        options.push(new Option(window.reporting_fields.computer.hardware[key],"hardware." + key));
      }
      options.push(new Option('--- Extension Attributes ---',''));
      for (var key in window.reporting_fields.computer.extension_attributes){
        options.push(new Option(window.reporting_fields.computer.extension_attributes[key],"extension_attributes." + key));
      }
      options.push(new Option('--- Applications ---',''));
      for (var key in window.reporting_fields.computer.applications){
        options.push(new Option(window.reporting_fields.computer.applications[key],"applications." + key));
      }
  }
  return options;
}

function addMultipleReportLineItems(lineItems){
  //First get the view template to be used for all line items
  $.get("/app-views/report-line-item.html", function(data) {
    //for every line item, add it to the view
    for (var i = 0; i < lineItems.length; i++){
      //make a copy of the report data to use as a template
      var template = data;
      template = template.replace(/{ID}/g, i);
      $("#advance-report-criteria").append(template);
      //Add all of the select options
      var options = getReportOptions();
      options.forEach(function(o){
        $("#field-value-"+i).append(o);
      });
      if (i == 0){
        //Disable the first and/or for the first criteria
        $("#include-value-0").prop('disabled', 'true');
        //Disable the ability to delete the first criteria
        $("#remove-line-item-button-0").remove();
      }
      //Populate all of the data
      fillDataForLineItem(i,lineItems[i]);
    }
    advanced_search_line_item_count = lineItems.length;
  });
}

//Keep a count of how many line items there are for advanced search
window.advanced_search_line_item_count = 0;
function addReportLineItem(lineItemToFill){
  //Get the element from the view table
  $.get("/app-views/report-line-item.html", function(data) {
    //Fill in the id for querying data later
    data = data.replace(/{ID}/g, window.advanced_search_line_item_count);
    $("#advance-report-criteria").append(data);
    //Get the select options to add to the report
    var options = getReportOptions();
    options.forEach(function(o){
      $("#field-value-"+window.advanced_search_line_item_count).append(o);
    });
    //Clone select options ito the fields to select
    if (window.advanced_search_line_item_count == 0){
      $("#fields-to-select-parent").html('<select id="fields-to-select" class="selectpicker form-control" multiple data-live-search="true"></select>');
      var $options = $(".advanced-report-field-dropdown > option").clone();
      $("#fields-to-select").selectpicker();
      $('#fields-to-select').append($options);
      $("#fields-to-select").selectpicker("refresh");
      //Disable the first and/or for the first criteria
      $("#include-value-0").prop('disabled', 'true');
      $("#remove-line-item-button-0").remove();
    }
    //If the line item isn't null, fill in the data now
    if (lineItemToFill != null){
      fillDataForLineItem(advanced_search_line_item_count,lineItemToFill);
    }
    advanced_search_line_item_count++;
  });
}

function doLogOut(){
  sessionStorage.removeItem("auth_token");
  location.reload();
}

function renderPage(){
  getSupportedReportFields();
  //Check if there is a certian tab to show
  var urlParams = new URLSearchParams(window.location.search);
  //Check if we should load a live device view
  if (urlParams.has('type') && urlParams.has('serial') && urlParams.has('udid')){
    getDeviceLive(urlParams.get('type'), urlParams.get('serial'), urlParams.get('udid'));
  }
  //Check if we should show a report
  if (urlParams.has('type') && urlParams.get('type') == 'view' && urlParams.has('reportId')){
    viewReportResults(urlParams.get('reportId'));
  }
  console.log(urlParams.get('tab'));
  //Redirect back if report view without any report id
  if (urlParams.has('tab') && urlParams.get('tab') == 'reports-results-view' && !urlParams.has('reportId')){
    changeView('computer-reports-view');
  } else if (urlParams.has('tab')){
    changeView(urlParams.get('tab'));
  }
  getOrgDetails();
  //Get all of the Jamf Pro Servers
  loadServerTable();
  updateComputers();
  updateMobileDevices();
  updateTvs();
  loadPatchesTable();
  loadPatchServersTable();
  getAllSavedReports();
  //Setup button listeners
  $("#add-server-button").click(function(){
    addServerToDatabase($("#add-server-url").val(), $("#add-server-username").val(), $("#add-server-password").val(), $("#add-server-limited-cron").val(),$("#add-server-expanded-cron").val());
  });
  $("#add-patch-server-button").click(function(){
    addPatchServerToDatabase($("#add-patch-server-url").val(), $("#add-patch-server-cron").val());
  });
  $("#servers-table-div").show();
  $('#cron-selector-limited').cron({
    onChange: function() {
        $('#add-server-limited-cron').val($(this).cron("value"));
    }
  }); // apply cron with default options
  $('#cron-selector-expanded').cron({
    onChange: function() {
        $('#add-server-expanded-cron').val($(this).cron("value"));
    }
  }); // apply cron with default options
  $('#update-cron-selector-limited').cron({
    onChange: function() {
        $('#update-cron-selector-limited').val($(this).cron("value"));
    }
  }); // apply cron with default options
  $('#update-cron-selector-expanded').cron({
    onChange: function() {
        $('#update-cron-selector-expanded').val($(this).cron("value"));
    }
  }); // apply cron with default options
  $('#patch-cron-selector').cron({
    onChange: function() {
        $('#add-patch-server-cron').val($(this).cron("value"));
    }
  }); // apply cron with default options
  //Add one advanced report criteria to start with
  addReportLineItem(null);
  //Whenever a tab is clicked, update the URL for quick refreshes
  $('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
    var target = $(e.target).attr("href");
    updateQueryStringParam('tab',target.substring(1,target.length));
  });
  if (sessionStorage.getItem("is_admin") == "true"){
    getSettingsForAdmin();
  } else {
    //Hide the settings tab
    $(".settings-view").remove();
  }
  //Show the selected fields for a report in the UI
  $("#fields-to-select").change(function(){
    $("#selected-fields-view").show();
    $("#selected-fields").html('');
    var size = $("#fields-to-select option:selected").length;
    //Hide the fields div
    if (size == 0){
      $("#selected-fields-view").hide();
    } else {
      $("#fields-to-select option:selected").each(function(index, e){
        if (index < size-1){
          $("#selected-fields").append($(this).text() + ', ');
        } else {
          $("#selected-fields").append($(this).text());
        }
      });
    }
  });
}

var urlParams = new URLSearchParams(window.location.search);
function changeViewBack(){
  //If there is something in session storage, show that
  var lastURLParams = JSON.parse(sessionStorage.getItem("last-view"));
  changeView(lastURLParams['tab']);
}

function changeView(newView){
  //Refresh url params
  urlParams = new URLSearchParams(window.location.search);
  //Keep a record of the last tab for a back button
  var savedObject = {};
  for(var param of urlParams.entries()) {
    savedObject[param[0]] = param[1];
  }
  sessionStorage.setItem('last-view', JSON.stringify(savedObject));
  //Hide all other views
  $(".view-pane").hide();
  //remove the active class
  $(".sidebar-button").removeClass('active');
  //If the new view is save report type, save the url params
  if (!(newView == 'create-new-report-view' && urlParams.has('reportType') && urlParams.has('type'))){
    //Show the new one, update the url
    resetURLParams();
    updateQueryStringParam('tab',newView);
  }
  //If we are going to the mdm command view, make sure devices are selected
  if (window.devices_to_send_mdm_commands.length == 0 && newView == 'mobile-commands-view'){
    swal('Error', 'Please select some devices before visiting this page.', 'error');
    changeView('ios-view');
  }
  if (window.devices_to_send_mdm_commands.length == 0 && newView == 'computer-commands-view'){
    swal('Error', 'Please select some devices before visiting this page.', 'error');
    changeView('macos-view');
  }
  //Make sure we are switching to the right view for mdm commands
  if (newView == 'computer-commands-view' && window.platform_to_send_commands_to != 'computers-table'){
    swal('Error', 'Incorrect device type selected for command types, please select some new devices.', 'error');
    changeView('macos-view');
  }
  if (newView == 'mobile-commands-view' && window.platform_to_send_commands_to != 'mobiledevices-table'){
    swal('Error', 'Incorrect device type selected for command types, please select some new devices.', 'error');
    changeView('ios-view');
  }
  $("#" + newView).show();
  //Add the active class
  //$("#" + newView).addClass('active');
  //Refresh url params
  urlParams = new URLSearchParams(window.location.search);
}

function changeReportView(deviceType, operation){
  if (operation == 'edit') {
    reloadReportPane(false);
  } else {
    reloadReportPane(true);
  }
  //Set the title at the top of the card
  if (deviceType == 'computer'){
    $("#report-name-field").html('New Computer Report');
  } else {
    $("#report-name-field").html('New Mobile Report');
  }
  changeView('create-new-report-view');
  //Add the url params for the type
  updateQueryStringParam('reportType', deviceType);
  updateQueryStringParam('type', operation);
  //if it's view, then remove the add criteria buttons and save
if (operation == 'edit') {
    $(".report-edit-button").show();
    $(".report-create-button").hide();
  } else {
    $(".report-create-button").show();
    $(".report-edit-button").hide();
  }
}
//resets all url params that is not navigation based
function resetURLParams(){
  updateQueryStringParam('type',null);
  updateQueryStringParam('serial',null);
  updateQueryStringParam('udid',null);
  updateQueryStringParam('reportType',null);
  updateQueryStringParam('isUpdate',null);
  updateQueryStringParam('type',null);
  updateQueryStringParam('reportId',null);
}

//Wait for the page to render
$(document).ready(function(){
  if (!("auth_token" in sessionStorage)){
    $("#login-button").click(function(){
      doLoginLDAP();
    });
    $("#login-user-button").click(function(){
      doLoginUserPass();
    });
    $("#register-button").click(function(){
      registerUser();
    });
    $('#login-user-modal').modal('show');
    //Make sure reshow the login if they click out of it
    $('#login-user-modal').on('hidden.bs.modal', function () {
      if (!("auth_token" in sessionStorage)){
        $('#login-user-modal').modal('show');
      }
    })
  } else {
    renderPage();
  }

});
