var serverUrl = window.server_host;

function returnCurrentPage(){
  if(window.location.href.indexOf("login") > -1) {
    return "login";
  } else if (window.location.href.indexOf("register") > -1){
    return "register";
  } else if (window.location.href.indexOf("dash") > -1){
    return "dashboard";
  }
}

function checkLogin(){
    if (!("auth_token" in sessionStorage)){
      sessionStorage.setItem("previousPage", "settings.html");
      $(location).attr('href','login.html');
    }
}

var updateQueryStringParam = function (key, value) {
    var baseUrl = [location.protocol, '//', location.host, location.pathname].join(''),
        urlQueryString = document.location.search,
        newParam = key + '=' + value,
        params = '?' + newParam;
    // If the "search" string exists, then build params from it
    if (urlQueryString) {
        updateRegex = new RegExp('([\?&])' + key + '[^&]*');
        removeRegex = new RegExp('([\?&])' + key + '=[^&;]+[&;]?');
        if( typeof value == 'undefined' || value == null || value == '' ) { // Remove param if value is empty
            params = urlQueryString.replace(removeRegex, "$1");
            params = params.replace( /[&;]$/, "" );
        } else if (urlQueryString.match(updateRegex) !== null) { // If param exists already, update it
            params = urlQueryString.replace(updateRegex, "$1" + newParam);
        } else { // Otherwise, add it to end of query string
            params = urlQueryString + '&' + newParam;
        }
    }
    window.history.replaceState({}, "", baseUrl + params);
};

function getDataTablesRequest(platform){
  var obj = {
    serverSide : true,
    ajax : {
      headers: { 'Authorization': 'Bearer '+sessionStorage.getItem("auth_token") },
      url : serverUrl + '/devices/paged/'+platform,
      type: 'POST',
      dataType: 'json',
      columns: [
        { data : "Name" },
        { data : "JPS Name" },
        { data : "Model" },
        { data : "Serial" },
        { data : "Last Inventory" },
        { data : "UDID" },
        { data : "Managed" },
        { data : "Active"},
        { data : "Action" }
      ]
    },
    select: {
      style: 'multi'
    }
  }
  return obj;
}

function getRequestObject(url, data, method){
  if ("auth_token" in sessionStorage){
    if (data != null){
      return jqXhr = $.ajax({
        headers: { 'Authorization': 'Bearer '+sessionStorage.getItem("auth_token") },
        url: serverUrl + url,
        contentType: 'application/json',
        dataType: 'json',
        type: method,
        data: JSON.stringify(data)
      });
    } else {
      return jqXhr = $.ajax({
        headers: { 'Authorization': 'Bearer '+sessionStorage.getItem("auth_token") },
        url: serverUrl + url,
        contentType: 'application/json',
        dataType: 'json',
        type: method
      });
    }
  } else if (data != null) {
    return jqXhr = $.ajax({
      url: serverUrl + url,
      contentType: 'application/json',
      dataType: 'json',
      type: method,
      data: JSON.stringify(data)
    });
  } else {
    return jqXhr = $.ajax({
      url: serverUrl + url,
      contentType: 'application/json',
      dataType: 'json',
      type: method
    });
  }
}
