var debug = false;

var checkEverySeconds = 5;
var auctionCheckEverySeconds = 2;
var serverTimeCheck = 0;

function makeHttpRequest(url, callback_function, return_xml, pass_credentials) {
   var http_request = false;

   if (window.XMLHttpRequest) {
       http_request = new XMLHttpRequest();
       if (http_request.overrideMimeType) {
           http_request.overrideMimeType('text/xml');
       }
   } 
   if (!http_request) {
       alert('Unfortunately your browser doesn\'t support this feature.');
       return false;
   }
   if (callback_function) {
     http_request.onreadystatechange = function() {

       if (http_request.readyState == 4) {
           if (http_request.status == 200) {
               var header = http_request.getResponseHeader('Date');
               var req_time = Date.parse(new Date(Date.parse(header)).toUTCString())/1000;
               if (req_time > currentServerTime+1) {
                  currentServerTime = req_time;
               }
               if (return_xml) {
                   eval(callback_function + '(http_request.responseXML)');
               } else {
                   eval(callback_function + '(http_request.responseText)');
               }
           }
           else if (http_request.status == 404 && callback_function == 'parseChatXML' ) {
               checkEverySeconds = 3600;
           }
       }
     }
   }
   http_request.open('GET', url, true);
   if(pass_credentials == 1) {
       http_request.withCredentials = true;
   }
   http_request.send(null);
}

function readServerTime () {
   if(serverTimeCheck <= 0) {
       var url = baseURLStatic + "/time.xml?" + get_random_string();
       makeHttpRequest(url, 'parseServerTime', 1);
       serverTimeCheck = 14;
   }
   else {
       serverTimeCheck--;
       currentServerTime++;
       parseServerTime(null);
   }
}

function parseServerTime (parseServerTimeXML) {

   var elem = document.getElementById("current_system_timestamp");
   if(elem) {
      elem.innerHTML = new Date(currentServerTime*1000).toLocaleString();
   }
}

function parsePlayerXML (playerXML) {
   var players = playerXML.getElementsByTagName("player");
   for (var i = 0; i < players.length; i++) {
      var pid = players[i].getAttribute("id");
      if (debug) {
         alert("got XML data back for pid = " + pid);
      }
      var attributes = players[i].attributes;
      for (var j = 0; j < attributes.length; j++) {
         var lookFor = attributes[j].name + "_" + pid;
         if (document.getElementById(lookFor)) {
            document.getElementById(lookFor).innerHTML = attributes[j].value;
         }
      }
      if (players[i].getAttribute("points").length > 0) {
         playerScore[pid] = players[i].getAttribute("points");
      }
      if (players[i].getAttribute("gameSecondsRemaining").length > 0) {
         playerGameSecondsRemaining[pid] = players[i].getAttribute("gameSecondsRemaining");
      }
      if (document.getElementById("player_" + pid)) {
         var node = document.getElementById("player_" + pid);
         var currentClass = node.getAttribute("class");
         if (currentClass == null || currentClass.length == 0) {
            currentClass = node.getAttribute("className");
         }
         var newClass = players[i].getAttribute("class");
         if (currentClass != newClass) {
            node.setAttribute("class", newClass);
            node.setAttribute("className", newClass);
         } else if (newClass == null || newClass.length == 0) {
            node.removeAttribute("class");
            node.removeAttribute("className");
         }
      }
      if (document.getElementById("points_" + pid) && players[i].getAttribute("explanation").length > 0) {
         var node = document.getElementById("points_" + pid);
         node.innerHTML = "<A HREF=\"javascript:void(0);\" onClick=\"alert(this.title);\" TITLE='" + players[i].getAttribute("explanation") + "'>" + parseFloat(playerScore[pid]).toFixed(precision) + "</A>";
      }
      if (document.getElementById("details_" + pid) && players[i].getAttribute("explanation").length > 0) {
         var node = document.getElementById("details_" + pid);
         var details = players[i].getAttribute("explanation").replace(/&#xA;/gi, "<br />");
         // &amp;#xA; = <br />
         node.innerHTML = details;
      }
   }
   players = null;
}

function formatAsMinutes (seconds) {
   var minutes = Math.floor(seconds / 60);
   var localSeconds = (seconds % 60);
   if (localSeconds.toString().length == 1) {
      localSeconds = "0" + localSeconds.toString();
   }
   return parseInt(minutes) + ":" + localSeconds;
}

function updateFranchiseData () {

   if (debug) {
      alert("inside updateFranchiseData");
   }
   var numFranchises = 0;
   var totalFranchiseScore = 0;
   for (var fid in franchiseScores) {
      var franchise_score = 0;
      var yet_to_play = 0;
      var currently_playing = 0;
      var seconds_remaining = 0;
      if (franchiseStarters[fid]) {
         numFranchises++;
         var playersArray = franchiseStarters[fid].split(",");
         for (var j = 0; j < playersArray.length; j++) {
            if (playersArray[j].length > 0) {
               if (playerScore[playersArray[j]]) {
                  franchise_score += parseFloat(playerScore[playersArray[j]]);
               }
               if (playerGameSecondsRemaining[playersArray[j]] > 0) {
                  seconds_remaining += parseInt(playerGameSecondsRemaining[playersArray[j]]);
                  if (playerGameSecondsRemaining[playersArray[j]] < 3600) {
                     currently_playing++;
                  } else {
                     yet_to_play++;
                  }
               }
            }
         }
      }
      franchiseScores[fid] = parseFloat(franchise_score).toFixed(precision);
      totalFranchiseScore += parseFloat(franchiseScores[fid]);

      if (document.getElementById("yet_to_play_" + fid)) {
         document.getElementById("yet_to_play_" + fid).innerHTML = yet_to_play;
      }
      if (document.getElementById("currently_playing_" + fid)) {
         document.getElementById("currently_playing_" + fid).innerHTML = currently_playing;
      }
      if (document.getElementById("minutes_remaining_" + fid)) {
         document.getElementById("minutes_remaining_" + fid).innerHTML = formatAsMinutes(seconds_remaining);
      }
   }
   if (numFranchises > 0) {
      franchiseScores['AVG'] = parseFloat(totalFranchiseScore / numFranchises).toFixed(precision);
   }
}

function reloadActivePlayers () {

   var gotData = false;
   if (debug) {
      alert("inside reloadActivePlayers, secondsSincePageLoaded = " + secondsSincePageLoaded);
   }
   for (var pid in playerGameStarts) {
      if (playerGameStarts[pid] <= (currentServerTime + secondsSincePageLoaded) && playerGameSecondsRemaining[pid] > 0) {
         var url = xmlBaseURL + league_id + '_' + pid + '_' + week + '.xml' + '?random=' + get_random_string();
         try {
            makeHttpRequest(url, 'parsePlayerXML', 1);
            gotData = true;
         } catch (e) {
            url = window.location.protocol + "//" + window.location.host + "/fflnetdynamic" + year + "/" + league_id + '_' + pid + '_' + week + '.xml?random=' + get_random_string();
            makeHttpRequest(url, 'parsePlayerXML', 1);
            gotData = true;
         }
      }
   }
   if (gotData) {
      updateFranchiseData();
      updateFranchiseScores();
   }
   secondsSincePageLoaded += checkEverySeconds;
   setTimeout("reloadActivePlayers()", checkEverySeconds * 1000);
}

function parseLiveScoringSummaryXML (liveScoringSummaryXML) {
   var franchises = liveScoringSummaryXML.getElementsByTagName("franchise");
   for (var i = 0; i < franchises.length; i++) {
      var fid = franchises[i].getAttribute("id");
      var score = franchises[i].getAttribute("score");
      franchiseScores[fid] = score;
   }
   franchises = null;
   updateFranchiseScores();
}

function reloadLiveScoringSummary (exportProgram, week) {
   if (debug) {
      alert("inside reloadLiveScoringSummary with exportProgram = " + exportProgram + ", league_id = " + league_id + ", week = " + week);
   }
   var timeout = 100 * 1000;
   var url = exportProgram + "?L=" + league_id + "&TYPE=liveScoring&W=" + week + "&COUNT=" + timeout;
   makeHttpRequest(url, 'parseLiveScoringSummaryXML', 1);
   setTimeout("reloadLiveScoringSummary('" + exportProgram + "','" + week + "')", timeout);
   url = null;
}

function updateFranchiseScores () {
   if (document.getElementById) {
      for (var fid in franchiseScores) {
         for (var i = 1; i < 10; i++) {
            var thisScore = document.getElementById("fid_" + fid + i);
            if (thisScore) {
               thisScore.innerHTML=parseFloat(franchiseScores[fid]).toFixed(precision);
            } else {
               break;
            }
         }
      }
   }
}

function toggle_display (id) {
   var table = document.getElementById(id);
   if (table) {
      var children = table.getElementsByTagName("TBODY");
      var new_status = '-';
      for (var i = 0; i < children.length; i++) {
         var display = children[i].style.display ? '' : 'none';
         if (display == 'none') {
            new_status = '+';
         }
         children[i].style.display = display;
         var url = window.location.protocol + "//" + window.location.host + "/" + year + "/save_setting?L=" + league_id + "&TITLE=DISPLAY&VALUE=" + id + ":" + display;
         makeHttpRequest(url);
      }
      // change the innerHTML to [-] or [+] accordingly...
      var spans = table.getElementsByTagName("SPAN");
      for (var i = 0; i < spans.length; i++) {
         var currentClass = spans[i].getAttribute("className");
         if (currentClass == null || currentClass.length == 0) {
            currentClass = spans[i].getAttribute("class");
         }
         if (currentClass != null && currentClass.length > 0 && currentClass.indexOf("module_expand") >= 0) {
            spans[i].innerHTML = "[" + new_status + "]";
         }
      }
   }
}

function show_tab (tab_id) {

   var done = false;
   var counter = 0;
   while (! done) {
      var this_tab_content = document.getElementById("tabcontent" + counter);
      var this_tab = document.getElementById("tab" + counter);
      if (! this_tab_content) {
         done = true;
      } else {
         if (counter == tab_id) {
            this_tab_content.style.display = '';
            this_tab.className = "currenttab";
         } else {
            this_tab_content.style.display = 'none';
            this_tab.className = "";
         }
      }
      counter++;
   }
   location.hash = tab_id;
}

function set_focus () {
   if (document.login && document.login.PASSWORD) {
      document.login.PASSWORD.focus();
   } else if (document.SELECT_FRANCHISE && document.SELECT_FRANCHISE.SELECT) {
      document.SELECT_FRANCHISE.SELECT.focus();
   } else if (document.chat && document.chat.chat && ! document.getElementById("body_ajax_ld") && ! document.getElementById("body_ajax_la") && ! document.getElementById("body_home")) {
      // don't set the focus in the live draft room or home page!
      document.chat.chat.focus();
   }
}

function test_scoring_window (url, rule) {
    var testScoring = window.open(url + escape(rule),"test_scoring","height=500,width=450,scrollbars=yes,toolbar=no,status=no,resizable=yes,menubar=no");
    testScoring.focus();
}

function help_window (program) {
    var createHelp = window.open("http://www.myfantasyleague.com/help/nojs/" + program + ".html","help_window","height=500,width=450,scrollbars=yes,toolbar=no,status=no,resizable=yes,menubar=no");
    createHelp.focus();
}

function chat_window (url) {
    var chatWindow = window.open(url,"chat_window","height=500,width=450,scrollbars=yes,toolbar=no,status=no,resizable=yes,menubar=no");
    chatWindow.focus();
}

function faq_answer_window (faq_id, category, subcategory) {
    var url = baseURLDynamic + "/" + year + "/show_faq?L=" + league_id;
    if (typeof faq_id != "undefined") {
       url += "&FAQ_ID=" + faq_id;
    }
    if (typeof category != "undefined") {
       url += "&CATEGORY=" + encodeURIComponent(category);
    }
    if (typeof subcategory != "undefined") {
       url += "&SUBCATEGORY=" + encodeURIComponent(subcategory);
    }
    var faq_window = window.open(url, "faq_window","height=500,width=450,scrollbars=yes,toolbar=no,status=no,resizable=yes,menubar=no");
    faq_window.focus();
}

function add_my_links () {
   var url = location.href;
   var title = document.title;
   if (title.substr(0, "Fantasy Football: ".length) == "Fantasy Football: ") {
      title = title.substr("Fantasy Football: ".length);
   }
   var newURL = window.location.protocol + "//" + window.location.host + "/" + year + "/add_my_links?L=" + league_id + "&URL=" + escape(url) + "&TITLE=" + escape(title);
   self.location = newURL;
}

function postChatMessage () {

   var field = document.getElementById("chat_text_field");
   var to_fid = "";
   if (field && field.form.TO_FID) {
      to_fid = field.form.TO_FID.options[field.form.TO_FID.selectedIndex].value;
   }

   if (field && field.value.length > 0) {
     var url = window.location.protocol + "//" + window.location.host + "/" + year + "/chat_save?L=" + league_id + "&MESSAGE=" + escape(field.value) + "&TO_FID=" + to_fid + "&random=" + get_random_string();
     field.value = '';
     makeHttpRequest(url);
     url = null;
     chatRead = 0;
     setTimeout("readMessages(false)", 250);
   }
}

function get_random_string () {
   var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
   var string_length = 8;
   var randomstring = '';
   for (var i=0; i<string_length; i++) {
      var rnum = Math.floor(Math.random() * chars.length);
      randomstring += chars.substring(rnum,rnum+1);
   }
   return randomstring;
}

function readMessages (restartTimer) {

   var url = xmlBaseURL + league_id + '_chat.xml?random=' + get_random_string();

   try {
      makeHttpRequest(url, 'parseChatXML', 1);
   } catch (e) {
      url = window.location.protocol + "//" + window.location.host + "/fflnetdynamic" + year + "/" + league_id + '_chat.xml?random=' + get_random_string();
      makeHttpRequest(url, 'parseChatXML', 1);
   }
   url = null;

   if (typeof chatRead == "undefined") {
      chatRead = 0;
   }
   chatRead++;
   // after 1440 five second intervals (2 hours) where this person hasn't posted, stop reading chat.
   var chatTimeout = 1440;
   if (chatRead < chatTimeout && restartTimer) {
      setTimeout("readMessages(true)", checkEverySeconds * 1000);
   } else if (chatRead >= chatTimeout) {
      // do we need to notify the customer that this has stopped?
      var chat_table = document.getElementById("league_chat");
      var table_body;
      if (chat_table) {
         table_body = chat_table.getElementsByTagName("TBODY");
      } else {
         table_body = document.getElementsByTagName("TBODY");
      }
      var body_rows = table_body[0].getElementsByTagName("TR");
      var new_row = document.createElement("TR");
      new_row.setAttribute("id", "pausedMessage");
      var cell = document.createElement("TD");
      cell.setAttribute("colspan", 2);
      cell.innerHTML = "<span class=\"warning\">Chat suspended due to inactivity - <a href=\"javascript:window.location.reload();\">refresh to resume</a>.</span>";
      new_row.appendChild(cell);
      table_body[0].insertBefore(new_row, body_rows[1]);
      chatRead = 0;
   }
}

function time_difference (oldTime, newTime) {
   var time_diff = newTime - oldTime;

   if (time_diff < 60) {
      time_diff = null;
      return "less than a minute ago";
   }
   var retval = "";
   var days = Math.floor(time_diff / (24 * 60 * 60));
   if (days > 0) {
      retval = days + " day";
   }
   if (days > 1) {
      retval += "s";
   }
   time_diff -= (days * 24 * 60 * 60);
   var hours = Math.floor(time_diff / (60 * 60));
   if (hours > 0) {
      if (retval.length > 0) {
        retval += ", ";
      }
      retval += hours + " hour";
   }
   if (hours > 1) {
      retval += "s";
   }
   time_diff -= (hours * 60 * 60);
   var minutes = Math.floor(time_diff / 60);
   if (minutes > 0) {
      if (retval.length > 0) {
        retval += ", ";
      }
      retval += minutes + " minute";
   }
   if (minutes > 1) {
      retval += "s";
   }
   retval += " ago";
   days = null;
   minutes = null;
   time_diff = null;
   return retval;
}

function parseVisitorsXML (visitorsXML) {
   var visitors = visitorsXML.getElementsByTagName("visit");
   var num_visitors = 0;
   var visitor_list_array = new Array();
   for (var i = 0; i < visitors.length; i++) {
      var fid = visitors[i].getAttribute("franchise_id");
      var timestamp = visitors[i].getAttribute("timestamp");
      var last_visit = document.getElementById("last_visit_" + fid);
      if (timestamp >= currentServerTime - (5 * 60)) {
         num_visitors++;
         visitor_list_array.push(franchiseDatabase['fid_' + fid].name);
         if (last_visit) {
            last_visit.setAttribute("class", "franchise_online");
            last_visit.setAttribute("className", "franchise_online");
            last_visit.innerHTML = time_difference(timestamp, currentServerTime);
         }
      } else {
         if (last_visit) {
            last_visit.setAttribute("class", "franchise_offline");
            last_visit.setAttribute("className", "franchise_offline");
            last_visit.innerHTML = time_difference(timestamp, currentServerTime);
         }
      }
      fid = null;
      timestamp = null;
      last_visit = null;
   }
   var visitor_count = document.getElementById("visitor_count");
   if (visitor_count && visitor_count.innerHTML != num_visitors) {
      // if (num_visitors > visitor_count.innerHTML) {
         // play_audio_clip("anotherleaguemateisonline");
      // }
      visitor_count.innerHTML = num_visitors;
   }
   var visitor_list = document.getElementById("visitor_list");
   if (visitor_list) {
      if (visitor_list.type == "select") {
         visitor_list.length = 0;
         for (var i = 0; i < visitor_list_array.length; i++) {
            visitor_list.options[visitor_list.length] = new Option(visitor_list_array[i]);
         }
      } else {
         var innerHTML = "";
         for (var i = 0; i < visitor_list_array.length; i++) {
            if (innerHTML.length > 0) {
               innerHTML += ", ";
            }
            innerHTML += visitor_list_array[i];
         }
         visitor_list.innerHTML = innerHTML;
      }
   }
   visitors = null;
   num_visitors = null;
   visitor_list_array = null;
}

function parseChatXML (chatXML) {
   var messages = chatXML.getElementsByTagName("message");

   var chat_table = document.getElementById("league_chat");
   var table_body;
   if (chat_table) {
      table_body = chat_table.getElementsByTagName("TBODY");
   } else {
      table_body = document.getElementsByTagName("TBODY");
   }

   var do_clear = false;
   var action = chatXML.getElementsByTagName("messages")[0].getAttribute("action");
   if (action && action == "clear") {
      do_clear = true;
   }

   var body_rows = table_body[0].getElementsByTagName("TR");
   var second_row = body_rows[1];
   var newMessage = 0;

   // todo - compare each message's "to" value to the current franchise_id - if it exists, and it's the same
   // display it, otherwise, don't
   if (! do_clear) {
      var messagesDisplayed = 0;
      for (var i = 0; i < messages.length; i++) {
         if (messagesDisplayed > displayMessages) {
            break;
         }
         var id = messages[i].getAttribute("id");
         if (! document.getElementById(id)) {
            var this_fid = messages[i].getAttribute("franchise_id");
            var to_fid = messages[i].getAttribute("to");
            if (to_fid != null) {
               // don't display it to folks who haven't logged in.
               if (typeof franchise_id == "undefined") {
                  // displayMessages++;
                  continue;
               }
               // don't display it unless i'm the sender or receiver!
               if (to_fid != franchise_id && this_fid != franchise_id) {
                  // displayMessages++;
                  continue;
               }
            }
            var message = conv_unicode(messages[i].getAttribute("message"));
            var posted = messages[i].getAttribute("posted");
            var new_row = document.createElement("TR");
            new_row.setAttribute("id", id);
            new_row.setAttribute("title", "Posted: " + posted);
            var make_it_bold = false;
            if (to_fid != null) {
               make_it_bold = true;
               new_row.className = "chat-highlight ";
            }
            var by_cell = document.createElement("TD");
            by_cell.innerHTML = (make_it_bold ? "<b>" : "") + franchiseDatabase['fid_' + this_fid].name + (make_it_bold ? "</b>" : "");
            new_row.appendChild(by_cell);
            var message_cell = document.createElement("TD");
            message_cell.innerHTML = (make_it_bold ? "<b>" : "") + message + (make_it_bold ? "</b>" : "");
            new_row.appendChild(message_cell);
            table_body[0].insertBefore(new_row, second_row);
            if (typeof franchise_id != "undefined" && this_fid != franchise_id) {
               newMessage++;
            }
         }
         messagesDisplayed++;
      }

      body_rows = table_body[0].getElementsByTagName("TR");
      for (var i = body_rows.length; i > displayMessages + 1; i--) {
         if (body_rows[i] && body_rows[i].getAttribute("id")) {
            table_body[0].deleteRow(i);
         }
      }


      body_rows = table_body[0].getElementsByTagName("TR");
      for (var i = 1; i < body_rows.length; i++) {
         if (body_rows[i] && body_rows[i].getAttribute("id") && body_rows[i].getAttribute("id") == "loadingchatdata") {
            table_body[0].deleteRow(i);
         }
      }
   } else {
      while (body_rows.length > 2) {
         table_body[0].deleteRow(1);
         body_rows = table_body[0].getElementsByTagName("TR");
      }
   }

   body_rows = table_body[0].getElementsByTagName("TR");
   for (var i = 1; i < body_rows.length; i++) {
      var this_class = "eventablerow";
      if (i % 2 == 1) {
         this_class = "oddtablerow";
      }
      body_rows[i].className = this_class + (body_rows[i].className.includes("chat-highlight") ? " chat-highlight" : "");
      //body_rows[i].class", this_class);
   }
   messages = null;
   if (newMessage == 1) {
      play_audio_clip("ohoh", "chat_audio_clip");
      // only do this if it's not the initial page load time!
      if (! document.getElementById("body_home")) {
         setTimeout("document.chat.chat.focus()", 100);
      }
   }
}

function hex_to_num (str) {
    var lc_str = str.toLowerCase();
    var val = 0;
    var hex_vals = "0123456789abcdef";
    var mult = 1;
    for (var i = lc_str.length - 1; i >= 0; i--) {
        var this_digit = lc_str[i];
        var this_value = hex_vals.indexOf(this_digit)
        if(this_value > 0) {
            val += this_value*mult;
        }
        mult = 16*mult;
    }
    return val;
}

function conv_unicode (str) {
    var new_str = str;
    //var matches = new_str.match(/\\x\{0-9A-F]+\}/ig);
    var matches = new_str.match(/\x5cx\x7b[0-9A-F]+\x7d/ig);
    if(matches == undefined) {
        return str;
    }
    for (var i = 0; i < matches.length; i++) {
        var match = matches[i];
        var start = match.indexOf('{')+1;
        var end = match.indexOf('}');
        var hex = match.substring(start, end);
        var unicode = String.fromCharCode(hex_to_num(hex));
        //console.log("match=" + match + " start=" + start + " end=" + end + " hex=" + hex + " unicode=" + unicode);
        new_str = new_str.replace(match, unicode);
    }
    return new_str;
}

function toggle_chat_audio () {
   var icon = document.getElementById("chat_audio_icon");
   var url;
   if (icon.src == baseURLStatic + "/sound-off-16x16.png") {
     icon.src = baseURLStatic + "/sound-16x16.png";
     icon.title = "Chat Audio On";
     icon.alt = "Chat Audio On";
     leagueAttributes['voice'] = 'david';
     url = window.location.protocol + "//" + window.location.host + "/" + year + "/save_setting?L=" + league_id + "&TITLE=CHAT_AUDIO&VALUE=On";
   } else {
     icon.src = baseURLStatic + "/sound-off-16x16.png";
     icon.title = "Chat Muted";
     icon.alt = "Chat Muted";
     leagueAttributes['voice'] = '';
     url = window.location.protocol + "//" + window.location.host + "/" + year + "/save_setting?L=" + league_id + "&TITLE=CHAT_AUDIO&VALUE=Off";
   }
   makeHttpRequest(url);
}

function updateVisitTracker () {
   var visit_tracker = document.getElementById("visit_tracker");
   if (visit_tracker) {
      var url = baseURLDynamic + "/" + year + "/visit?L=" + league_id + "&random=" + get_random_string();
      visit_tracker.src = url;
      url = null;
   }
}

function updateOnlineStatus () {
   var url = xmlBaseURL + league_id + '_visitors.xml?random=' + get_random_string();
   try {
      makeHttpRequest(url, 'parseVisitorsXML', 1);
   } catch (e) {
      url = window.location.protocol + "//" + window.location.host + "/fflnetdynamic" + year + "/" + league_id + '_visitors.xml?random=' + get_random_string();
      makeHttpRequest(url, 'parseVisitorsXML', 1);
   }
   url = null;
}

function removeListItem() {
   var sourceList = document.getElementById("source_list");
   var destinationList = document.getElementById("destination_list");
   var index = destinationList.selectedIndex;
   if (index == -1) {
     alert("You must first select the item to remove.");
   } else {
      if (sourceList) {
         sourceList.options[sourceList.length] = new Option(destinationList[destinationList.selectedIndex].text, destinationList[destinationList.selectedIndex].value);
      }
      destinationList.options[index] = null;
      if (navigator.appName == "Netscape" && parseInt(navigator.appVersion) <= 4) {
         history.go(0);
      }
   }
}

function addListItems() {
   var sourceList = document.getElementById("source_list");

   while (sourceList.selectedIndex >= 0) {
      addListItem();
   }
}

function removeListItems () {
   var destinationList = document.getElementById("destination_list");
   while (destinationList.selectedIndex >= 0) {
      removeListItem();
   }
}

function addListItem() {
   var sourceList = document.getElementById("source_list");
   var destinationList = document.getElementById("destination_list");

   if (sourceList.selectedIndex >= 0) {
      var holdMultiple = sourceList.multiple;
      sourceList.multiple = false;
      var itemName = sourceList[sourceList.selectedIndex].text;
      var itemValue = sourceList[sourceList.selectedIndex].value;
      destinationList.options[destinationList.length] = new Option(itemName, itemValue);
      sourceList.options[sourceList.selectedIndex] = null;
      sourceList.multiple = holdMultiple;
      if (navigator.appName == "Netscape" && parseInt(navigator.appVersion) <= 4) {
         history.go(0);
      }
   }
}

function checkValue(list_id,value){
    var x = document.getElementById(list_id);
    var found = false;
    for (var i=0;i<x.options.length;i++) {
        if(x.options[i].value===value) found = true;
    }
    return found
}

function addToList(to_id,value_id,name_id) {
    var to_list = document.getElementById(to_id);
    if(to_list) {
        var pidn = document.getElementById(name_id);
        var pidv = document.getElementById(value_id);
        var itemValue = pidv.value;
        var itemName = pidn.innerHTML;
        if(checkValue("destination_list",itemValue)) {
            alert("This player has already been added to your list")
        }  
        else {
            if(itemValue && itemName.length > 0) { 
                to_list.options[to_list.length] = new Option(itemName, itemValue);
            }
        }
    }
}

function moveItemUp (times) {
   var destinationList = document.getElementById("destination_list");
   if (destinationList.selectedIndex >= 0) {
      if (destinationList.selectedIndex <= times) {
         times = destinationList.selectedIndex;
      }
      for (var i = 0; i < times; i++) {
         moveItem(true);
      }
   }
}

function moveItemDown (times) {
   var destinationList = document.getElementById("destination_list");
   if (destinationList.selectedIndex >= 0) {
      if (destinationList.options.length - destinationList.selectedIndex <= times) {
         times = destinationList.options.length - destinationList.selectedIndex - 1;
      }
      for (var i = 0; i < times; i++) {
         moveItem(false);
      }
   }
}

function moveItem (moveUp, dest_list_id) {
   if(dest_list_id == undefined) {
      dest_list_id = "destination_list";
   }
   var destinationList = document.getElementById(dest_list_id);
   var index = destinationList.selectedIndex;
   if (index==-1) {
      alert("You must first select the item to reorder.");
   } else {
      var holdMultiple = destinationList.multiple;
      destinationList.multiple = false;
      var newIndex = index+( moveUp ? -1 : 1);
      if (newIndex<0) newIndex=destinationList.length-1;
      if (newIndex>=destinationList.length) newIndex=0;
      var oldVal = destinationList[index].value;
      var oldText = destinationList[index].text;
      destinationList[index].value = destinationList[newIndex].value;
      destinationList[index].text = destinationList[newIndex].text;
      destinationList[newIndex].value = oldVal;
      destinationList[newIndex].text = oldText;
      destinationList.selectedIndex = newIndex;
      destinationList.multiple = holdMultiple;
      if (navigator.appName == "Netscape" && parseInt(navigator.appVersion) <= 4) {
         history.go(0);
      }
   }
}

function selectAllItems (dest_list_id) {
   if(dest_list_id == undefined) {
      dest_list_id = "destination_list";
   }
   var destinationList = document.getElementById(dest_list_id);
   var itemsSelected = false;
   destinationList.multiple = true;
   for (var i = 0 ; i < destinationList.length; i++) {
      destinationList.options[i].selected = true;
      itemsSelected = true;
   }
   return itemsSelected;
}

function Player (id, name, position, team, times_available, bye_week, formatted_salary, ytd_points, adp_rank, my_draft_list_rank) {
   this.id = id;
   this.name = name;
   this.position = position;
   this.team = team;
   this.times_available = times_available;
   this.bye_week = bye_week;
   this.formatted_salary = formatted_salary;
   this.ytd_points = ytd_points;
   this.adp_rank = adp_rank;
   this.my_draft_list_rank = my_draft_list_rank;
}

function play_audio_clip(file_name, domid) {

   // if chat's got focus, don't play the audio clip!
   // if (document.chat && document.chat.chat && document.activeElement && document.chat.chat == document.activeElement) {
      // return;
   // }

   if(leagueAttributes['voice'] == 'No') {
       return;
   }
   if (typeof domid == "undefined") {
      domid = "draft_audio_clip";
   }
   var sound = document.getElementById(domid);
   if (sound && leagueAttributes['voice'] != "none" && leagueAttributes['voice'] != '') {
      var sound_url = baseURLStatic + "/sounds/" + leagueAttributes['voice'] + "/" + file_name + ".wav";
      if (typeof current_audio != "undefined") {
         document.body.removeChild(current_audio);
         current_audio = null;
      }
// alert("got a sound_url of " + sound_url);
      if (((current_audio = document.createElement("audio")) != null) && current_audio.canPlayType && current_audio.canPlayType("audio/wav")) {
         //console.log("audio tag used!");
         current_audio.setAttribute("src", sound_url);
         current_audio.setAttribute("autoplay","autoplay");
         document.body.appendChild(current_audio); 
         // current_audio.load();
      } else if ((current_audio = document.createElement("embed")) == null) {
         alert("cannot play audio!");
      } else {
         current_audio.setAttribute("width","0");
         current_audio.setAttribute("height","0");
         current_audio.setAttribute("hidden","true");
         current_audio.setAttribute("autostart","true");
         current_audio.setAttribute("autoplay","true");
         current_audio.setAttribute("src", sound_url);
         document.body.appendChild(current_audio); 
      }
   }
}

function check_all_checkboxes (object,not_disabled) {
   var isChecked = object.checked;
   var form = object.form;
   for (var i = 0; i < form.elements.length; i++) {
       if (form.elements[i].type == "checkbox") {
           if(!not_disabled || !form.elements[i].disabled) {
              form.elements[i].checked = isChecked;
           }
       }
   }
}

function showhints (this_form) {
   // given a form, show the hints for it.
   var this_id = this_form.id;
   for (var i in mfl_hints[this_id]) {
      var element = document.getElementById(i);
      if (element) {
          var hintSpan = document.createElement("span");
          hintSpan.setAttribute("class", "reportnavigation");
          var hintWord = document.createElement("span");
          hintWord.setAttribute("class", "reportnavigationheader");
          hintWord.appendChild(document.createTextNode(hintword));
          var newHint = document.createTextNode(mfl_hints[this_id][i]);
          hintSpan.appendChild(hintWord);
          hintSpan.appendChild(newHint);
          element.parentNode.appendChild(hintSpan);
      }
   }
}

function enable_elements (this_form) {
   // given a form, enable/disable the appropriate child elements
   // based on the status of the various parent_enabled and parent_disabled elements.
   for (var i = 0; i < this_form.elements.length; i++) {
      if (this_form.elements[i].type == "radio" || this_form.elements[i].type == "checkbox") {
         var currentClass = this_form.elements[i].getAttribute("class");
         if (currentClass == null || currentClass.length == 0) {
            currentClass = this_form.elements[i].getAttribute("className");
         }
         if (currentClass && currentClass.length > 0) {
            if (currentClass.indexOf("parent_disabled") >= 0 || currentClass.indexOf("parent_enabled") >= 0) {
               // we've got parent fields - set up event handlers for these fields to enable/disable children appropriately.
               this_form.elements[i].onclick=function() {
                  var currentClass = this.getAttribute("class");
                  if (currentClass == null || currentClass.length == 0) {
                     currentClass = this.getAttribute("className");
                  }
                  if (currentClass && currentClass.length > 0) {
                     if (currentClass.indexOf("parent_disabled") >= 0) {
                        // for all children with the same suffix, disable them.
                        var suffix = currentClass.substr(currentClass.indexOf("parent_disabled") + "parent_disabled".length, 1);
                        for (var i = 0; i < this.form.elements.length; i++) {
                           var newClass = this.form.elements[i].getAttribute("class");
                           if (newClass == null || newClass.length == 0) {
                              newClass = this.form.elements[i].getAttribute("className");
                           }
                           if (newClass && newClass.length > 0 && newClass.indexOf("child" + suffix) >= 0) {
                              this.form.elements[i].disabled = true;
                           }
                        }
                     }
                     if (currentClass.indexOf("parent_enabled") >= 0) {
                        // for all children with the same suffix, enable them.
                        var suffix = currentClass.substr(currentClass.indexOf("parent_enabled") + "parent_enabled".length, 1);
                        for (var i = 0; i < this.form.elements.length; i++) {
                           var newClass = this.form.elements[i].getAttribute("class");
                           if (newClass == null || newClass.length == 0) {
                              newClass = this.form.elements[i].getAttribute("className");
                           }
                           if (newClass && newClass.length > 0 && newClass.indexOf("child" + suffix) >= 0) {
                              this.form.elements[i].disabled = false;
                           }
                        }
                     }
                  }
               }
            }
         }
      }
   }
}

function make_editable (object) {
   var current_quote = object.innerHTML;
   var parentNode = object.parentNode;
   var inputNode = document.createElement("input");
   inputNode.setAttribute("type", "text");
   inputNode.setAttribute("size", "50");
   inputNode.setAttribute("maxlength", "200");
   inputNode.setAttribute("value", current_quote);
   inputNode.onblur=save_owner_quote;
   if (parentNode) {
      inputNode.setAttribute("name", parentNode.id);
      parentNode.removeChild(object);
      parentNode.appendChild(inputNode);
   }
}

function save_owner_quote () {
   var parentNode = this.parentNode;
   var newQuote = this.value;

   var this_quote_type = this.name;

   var newTextNode = document.createTextNode(newQuote);
   parentNode.removeChild(this);
   parentNode.appendChild(newTextNode);

   // save the new text here!
   var url = window.location.protocol + "//" + window.location.host + "/" + year + "/save_setting?L=" + league_id + "&TITLE=";
   if (typeof recapWeek != "undefined") {
      url += "RECAP_QUOTE&W=" + recapWeek;
   } else if (typeof previewWeek != "undefined") {
      url += "PREVIEW_QUOTE&W=" + previewWeek;
   } else {
      url += this_quote_type;
   }
   url += "&VALUE=" + encodeURIComponent(newQuote);
   makeHttpRequest(url);
}

function FC_Rendered(domId){
   if (domId == "starterPointsChart") {
      document.position_chart.disabled = false;
      positionChartLoaded = true;
      var chartObj = getChartFromId(domId);
      chartObj.setDataXML(generatePositionXML());
   } else if (domId == "weeklyResultsChart") {
      document.weekly_results.disabled = false;
      weeklyResultsChartLoaded = true;
      var chartObj = getChartFromId(domId);
      chartObj.setDataXML(generateWeeklyResultsXML());
   } else if (domId == "pointsAllowedChart") {
      document.points_allowed_chart.disabled = false;
      pointsAllowedChartLoaded = true;
      var chartObj = getChartFromId(domId);
      chartObj.setDataXML(generatePointsAllowedXML());
   }
   return true;
}

function add_player_to_roster (fid, pid) {
   var need_to_add = true;
   for (var i = 0; i < franchiseRosters['fid_' + fid].length; i++) {
      if (franchiseRosters['fid_' + fid][i] == pid) {
          need_to_add = false;
      }
   }

   if (need_to_add) {
      franchiseRosters['fid_' + fid][franchiseRosters['fid_' + fid].length] = pid;
   }
}

function remove_player_from_roster (fid, pid) {
    var fkey = 'fid_' + fid;
    for (var i = 0; i < franchiseRosters[fkey].length; i++) {
        if (franchiseRosters[fkey][i] == pid) {
            franchiseRosters[fkey].splice(i,1);
        }
    }
}

function twitterAddLinks(text) {
    var exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/i;
    text = text.replace(exp, "<a href='$1' target='_blank'>$1</a>");
    exp = /(^|\s)#(\w+)/g;
    text = text.replace(exp, "$1<a href='http://search.twitter.com/search?q=%23$2' target='_blank'>#$2</a>");
    exp = /(^|\s)@(\w+)/g;
    text = text.replace(exp, "$1<a href='http://www.twitter.com/$2' target='_blank'>@$2</a>");
    return text;
}

function set_module_hide_status () {
    if(moduleExpand == 1) {
        for (var mod_id in moduleStates) {
            var table = document.getElementById(mod_id);
            if(table) {
                var captions = table.getElementsByTagName("CAPTION");
                for (var j = 0; j < captions.length; j++) {
                    var span = document.createElement("span");
                    span.setAttribute("className", "module_expand");
                    span.setAttribute("class", "module_expand");
                    span.setAttribute("href", "javascript:void(0);");
                    span.onclick=function() {
                        toggle_display(this.parentNode.parentNode.getAttribute('id'));
                    }
                    captions[j].insertBefore(span, captions[j].firstChild);
                    if(moduleStates[mod_id] == 0) {
                        span.innerHTML = "[+]";
                        var children = table.getElementsByTagName("TBODY");
                        for (var i = 0; i < children.length; i++) {
                            children[i].style.display = 'none';
                        }
                    }
                    else {
                        span.innerHTML = "[-]";
                    }
                }
            }
        }
    }
}

window.onload=function() {
   if (document.getElementById("body_home")) {
      set_module_hide_status();
   } else {
      set_focus();
   }
   if (document.getElementById("chat_text_field")) {
      document.getElementById("chat_text_field").onkeypress=function(event) {
         var code = event && event.which ? event.which : window.event.keyCode;
         if (code == 13 || code == 3) {
            postChatMessage();
            return false;
         }
      }
   }
   if (document.getElementById("loadingchatdata")) {
      readMessages(true);
   }
   if (document.getElementById("visit_tracker") && typeof visitTrackerInterval == "undefined") {
      visitTrackerInterval = setInterval('updateVisitTracker()', 120 * 1000);
   }
   if (document.getElementById("visitor_count") || document.getElementById("last_visit_0000") || document.getElementById("visitor_list") && typeof onlineStatusInterval == "undefined") {
      updateOnlineStatus();
      onlineStatusInterval = setInterval('updateOnlineStatus()', 60 * 2000);
   }
   if (document.getElementById("body_ajax_ld")) {
      play_audio_clip("welcometoyourlivedraft");
      if (typeof draftStatusInterval == "undefined") {
         draftStatusInterval = setInterval('readDraftStatus()', checkEverySeconds * 1000);
      }
      if (typeof draftLogInterval == "undefined") {
         // initialize the draft log...
         readDraftLog();
         draftLogInterval = setInterval('readDraftLog()', checkEverySeconds * 1000);
      }
      if (document.pick_form && document.pick_form.PLAYER_PICK) {
         load_player(document.pick_form.PLAYER_PICK);
      }
   }
   if (document.getElementById("body_ajax_la")) {
      if (document.pick_form && document.pick_form.PLAYER_PICK) {
         load_player(document.pick_form.PLAYER_PICK);
      }
   }
   if (document.getElementById("current_system_timestamp")) {
      if (typeof serverTimeInterval == "undefined") {
         serverTimeInterval = setInterval('readServerTime()', 1000);
      }
   }
   if (document.getElementById("contest_wide_live_scoring")) {
      if (navigator.userAgent.indexOf("Firefox") > -1) {
         // goes to top of page, but also forces refresh in Firefox.
         var contest_live_scoring_timeout = setTimeout("window.location.reload(true)", 15 * 60 * 1000);
      } else {
         // keeps current position on page, and also forces refresh in IE.
         var contest_live_scoring_timeout = setTimeout("history.go(0)", 15 * 60 * 1000);
      }
   }

   
   for (var i = 1; i <= leagueAttributes['Franchises']; i++) {
      var formatted_fid = "00";
      if (i < 10) {
         formatted_fid += "0";
      }
      formatted_fid += "" + i;
      if (document.getElementById("player_photo_" + formatted_fid)) {
         display_photo(formatted_fid, 0);
         // only do this on a day other than sunday!
         if ((new Date()).getDay() != 0) {
            setInterval("next_photo_" + formatted_fid + "()", 2.5 * 1000);
         }
      }
   }
   if (document.forms.length > 0) {
      for (var i = 0; i < document.forms.length; i++) {
         var currentClass = document.forms[i].getAttribute("class");
         if (currentClass == null || currentClass.length == 0) {
            currentClass = document.forms[i].getAttribute("className");
         }
         if (currentClass && currentClass.length > 0 && currentClass.indexOf("enable_elements") >= 0) {
            enable_elements(document.forms[i]);
         }
         if (currentClass && currentClass.length > 0 && currentClass.indexOf("showhints") >= 0) {
            showhints(document.forms[i]);
         }
      }
   }
   if (document.getElementById("scrollingText")) {
      if (typeof scrollingTextSpeed == "undefined") {
         scrollingTextSpeed = 125;
      }
      setInterval(animateScrollingText, scrollingTextSpeed);
   }
}

window.onunload=function() {
   if (document.getElementById("visit_tracker")) {
      clearInterval(visitTrackerInterval);
   }
   if (document.getElementById("visitor_count") || document.getElementById("last_visit_0000") || document.getElementById("visitor_list")) {
      clearInterval(onlineStatusInterval);
   }
   if (document.getElementById("body_ajax_ld")) {
      clearInterval(draftStatusInterval);
      clearInterval(draftLogInterval);
   }
   if (document.getElementById("current_system_timestamp")) {
      clearInterval(serverTimeInterval);
   }
}

function mfl_get_cookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for(var i = 0; i <ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

function mfl_set_cookie(cname, cvalue, exdays, path) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    var expires = "expires=" + d.toUTCString();
    if(path == undefined || path == "") {
        path = "/";
    }
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=" + path;
}

function launch_player_modal (lid,pid) {
    var body_elem = document.getElementById("modal_body_player");
    if(body_elem != undefined) {
        body_elem.innerHTML = "Loading...";
        var title_elem = document.getElementById("modal_title_player");
        if(title_elem != undefined) {
            title_elem.innerHTML = "&nbsp;";
        }
        show_modal_player();

        var xhttp = new XMLHttpRequest();
        player_page_url = baseURLDynamic + "/" + year + "/player?";
        if(lid) {
            player_page_url = player_page_url + "L=" + lid + "&";
        }
        player_page_url = player_page_url + "P=" + pid;
        var xml_url = player_page_url + "&POPUP=1";
        xhttp.onreadystatechange = function() {
            if (xhttp.readyState == 4) {
                var name_pos = xhttp.responseText.indexOf("<h3>"); 
                var name_end = xhttp.responseText.indexOf(":",name_pos);
                var name = xhttp.responseText.slice(name_pos+4, name_end);
                var title_end = xhttp.responseText.indexOf("</h3>", name_end); 
                title_elem.innerHTML = name;
                body_elem.innerHTML = xhttp.responseText.slice(title_end+5);
            }
        };
        xhttp.open("GET", xml_url, true);
        xhttp.send();
    }
}

function launch_popup_modal (title,url) {
    var body_elem = document.getElementById("modal_body_popup");
    if(body_elem != undefined) {
        body_elem.innerHTML = "Loading...";
        var title_elem = document.getElementById("modal_title_popup");
        if(title_elem != undefined) {
            title_elem.innerHTML = title;
        }
        show_modal_popup();

        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (xhttp.readyState == 4) {
                body_elem.innerHTML = xhttp.responseText;
            }
        };
        xhttp.open("GET", url, true);
        xhttp.send();
    }
}

function hasClass (elem, cname) {
    if(elem.classList) {
        return elem.classList.contains(cname);
    }
    else {
        return !!elem.className.match(new RegExp('(\\s|^)' + cname + '(\\s|$)'));
    }
}

function addClass (elem, cname) {
    if(elem.classList) {
        elem.classList.add(cname);
    }
    else if(!hasClass(elem,cname)) {
        elem.className += " " + cname;
    }
}

function removeClass (elem, cname) {
    if(elem.classList) {
        elem.classList.remove(cname);
    }
    else if(!hasClass(elem,cname)) {
        var reg = new RegExp('(\\s|^)' + cname + '(\\s|$)');
        elem.className = elem.className.replace(reg,' ');
    }
}


