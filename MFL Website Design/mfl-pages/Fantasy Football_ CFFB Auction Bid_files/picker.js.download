
var picker_sortby;
var picker_sort_tieb;
var picker_cur_sel = new Object();
var picker_pid_store_id = new Object();
var picker_name_store_id = new Object();
var picker_settings_store_id = new Object();
var picker_filter_pos = new Object(); 
var picker_filter_nfl = new Object();
var picker_filter_name = new Object();
var picker_names = new Object();
var picker_align = new Object();
var picker_width = new Object();
var picker_onselect = new Object();
var pp_playerDB;

function init_picker (picker_id,pid_id,name_id,curr_sel,multi_select,settings_id) {
    picker_pid_store_id[picker_id] = pid_id;
    picker_name_store_id[picker_id] = name_id;
    picker_settings_store_id[picker_id] = settings_id;
    update_picker(picker_id);
    if(curr_sel > 0) { 
        picker_select(picker_id,curr_sel,1);
    }
}

function save_settings (picker_id,field_num,new_val) {
    if(picker_settings_store_id[picker_id].length > 0) {
        var field =
                 document.getElementById(picker_settings_store_id[picker_id]);
        var settings = field.value.split(",");
        settings[field_num] = new_val;
        field.value = settings.join(",");
    }
}

function update_picker(picker_id) {
    var picker = document.getElementById(picker_id);
    var keys = [];
    pp_playerDB = playerDatabaseObj[picker_id];
    for (var i = 0; i < pp_playerDB.length; i++) {
        keys[i] = i;
    }
    var sortedKeys = keys.sort(picker_sort);
    var content = new String; 
    for (var i = 0; i < sortedKeys.length; i++) {
        var j = sortedKeys[i];
        var skip = 0;
        if(pp_playerDB[j].avail < 1) {
            skip = 1;
        }
        else if(picker_filter_pos[picker_id] != 'ALL' &&
           picker_filter_pos[picker_id] != pp_playerDB[j].pos) {
            skip = 1;
        }
        else if(picker_filter_nfl[picker_id] != 'ALL' &&
           picker_filter_nfl[picker_id] != pp_playerDB[j].nfl_team) {
            skip = 1;
        }
        else if(picker_filter_name[picker_id] != '' &&
                picker_filter_name[picker_id] != 'player name') {
            var lower = pp_playerDB[j].name.toLowerCase();
            if(!lower.startsWith(picker_filter_name[picker_id])) {
                skip = 1;
            }
        }
        if(skip == 0) {
            content += "<tr id='" + picker_id + "_" + j + "' onclick='picker_select(" + '"' + picker_id + '",' + j + ",0)'>";
            for (var f = 0; f < picker_names[picker_id].length; f++) {
                content += "<td width='" + picker_width[picker_id][f] + "px' align='" + picker_align[picker_id][f] + "'>" + pp_playerDB[j][picker_names[picker_id][f]] + "</td>";
            }
            content += "</tr>";
        }
    }
    picker.innerHTML = content;
    if(picker_cur_sel[picker_id] >= 0) {
        picker_select(picker_id,picker_cur_sel[picker_id],0);
    }
    return;
}

function picker_select(picker_id,i,scroll) {
    var row_id = picker_id + "_" + i;
    var row = document.getElementById(row_id);
    if(!row) {
        picker_cur_sel[picker_id] = -1;
    }
    else {
        if(picker_cur_sel[picker_id] >= 0) {
            // Unselect the old row
            var old_row_id = picker_id + "_" + picker_cur_sel[picker_id];
            var old_row = document.getElementById(old_row_id);
            if(old_row) {
                old_row.className = old_row.className.replace(/(?:^|\s)highlight(?!\S)/g ,'');
            }
            if(i == picker_cur_sel[picker_id]) {
                i = -1;
            }
            picker_cur_sel[picker_id] = -1;
        }
        if(i >= 0) {
            // Select the new row
            row.className = ' highlight';
            picker_cur_sel[picker_id] = i;
            if(scroll) {
                var toppos = row.offsetTop;
                var scroller = document.getElementById(picker_id).parentElement;
                scroller.scrollTop = toppos;
            }
        }
    }
    var pdb = playerDatabaseObj[picker_id];
    var idx = picker_cur_sel[picker_id];
    if(picker_pid_store_id[picker_id].length > 0) {
        var pidf = document.getElementById(picker_pid_store_id[picker_id]);
        pidf.value = idx == -1 ? "" : pdb[idx].id;
    }
    if(picker_name_store_id[picker_id].length > 0) {
        var namef = document.getElementById(picker_name_store_id[picker_id]);
        if(idx == -1) {
            namef.innerHTML = "";
        }
        else {
            namef.innerHTML = pdb[idx].name + " " + pdb[idx].nfl_team +
                              " " + pdb[idx].pos;
        }
    }
    picker_onselect[picker_id]();
    return;
}

function picker_filter(picker_id) {
    var filter_id = picker_id + "_filt_pos";
    var filter = document.getElementById(filter_id);
    if(filter) {
        picker_filter_pos[picker_id] = filter.value;
        save_settings(picker_id,1,filter.value);
    }
    filter_id = picker_id + "_filt_nfl";
    filter = document.getElementById(filter_id);
    if(filter) {
        picker_filter_nfl[picker_id] = filter.value;
        save_settings(picker_id,2,filter.value);
    }
    filter_id = picker_id + "_filt_name";
    filter = document.getElementById(filter_id);
    if(filter) {
        picker_filter_name[picker_id] = filter.value.toLowerCase();
        save_settings(picker_id,3,filter.value.toLowerCase());
    }
    update_picker(picker_id);
    return;
}

function picker_reset_filters(picker_id) {
    var filter_id = picker_id + "_filt_pos";
    var filter = document.getElementById(filter_id);
    if(filter) {
        filter.value = "ALL";
        picker_filter_pos[picker_id] = "ALL";
        save_settings(picker_id,1,filter.value);
    }
    filter_id = picker_id + "_filt_nfl";
    var filter = document.getElementById(filter_id);
    if(filter) {
        filter.value = "ALL";
        picker_filter_nfl[picker_id] = "ALL";
        save_settings(picker_id,2,filter.value);
    }
    filter_id = picker_id + "_filt_name";
    var filter = document.getElementById(filter_id);
    if(filter) {
        filter.value = "Player Name";
        picker_filter_name[picker_id] = "";
        save_settings(picker_id,3,filter.value);
    }
    update_picker(picker_id);
    return;
}

function sort_picker(sort_by,sort_tieb,picker_id) {
    picker_sortby = sort_by;
    picker_sort_tieb = sort_tieb;
    update_picker(picker_id);
    save_settings(picker_id,0,sort_by);
    return;
}

function picker_sort(a,b) {
    var aval = 0;
    var bval = 0;
    var ascii = 0;
    if(picker_sortby == "adp") {
        aval = pp_playerDB[a].adp;
        bval = pp_playerDB[b].adp;
    }
    else if(picker_sortby == 'bye_week') {
        aval = pp_playerDB[a].bye_week;
        bval = pp_playerDB[b].bye_week;
        if(aval == 'n/a') { aval = 1000; }
        if(bval == 'n/a') { bval = 1000; }
    }
    else if(picker_sortby == 'myrank') {
        aval = pp_playerDB[a].myrank > 0 ? pp_playerDB[a].myrank : 1000;
        bval = pp_playerDB[b].myrank > 0 ? pp_playerDB[b].myrank : 1000;
    }
    else if(picker_sortby == 'fsrank') {
        aval = pp_playerDB[a].fsrank > 0 ? pp_playerDB[a].fsrank : 1000;
        bval = pp_playerDB[b].fsrank > 0 ? pp_playerDB[b].fsrank : 1000;
    }
    else if(picker_sortby == "sal") {
        aval = pp_playerDB[b].sort_sal;
        bval = pp_playerDB[a].sort_sal;
    }
    else if(picker_sortby == "projpts") {
        aval = pp_playerDB[b].projpts;
        bval = pp_playerDB[a].projpts;
    }
    else if(picker_sortby == "pwpts") {
        aval = pp_playerDB[b].pwpts;
        bval = pp_playerDB[a].pwpts;
    }
    else if(picker_sortby == "pts") {
        aval = pp_playerDB[b].pts;
        bval = pp_playerDB[a].pts;
    }
    else if(picker_sortby == "lypts") {
        aval = pp_playerDB[b].lypts;
        bval = pp_playerDB[a].lypts;
    }
    else if(picker_sortby == "pos") {
        aval = positionSort[pp_playerDB[a].pos];
        bval = positionSort[pp_playerDB[b].pos];
    }
    else if(picker_sortby == "nfl_team") {
        aval = pp_playerDB[a].nfl_team;
        bval = pp_playerDB[b].nfl_team;
        ascii = 1;
    }
    else if(picker_sortby == "opp") {
        aval = pp_playerDB[a].opp;
        bval = pp_playerDB[b].opp;
        ascii = 1;
    }
    else {
        aval = pp_playerDB[a].name;
        bval = pp_playerDB[b].name;
        ascii = 1;
    }
    var diff;
    if(ascii == 1) {
        diff = (aval < bval) ? -1 : ((aval > bval) ? 1 : 0);
    }
    else {
        diff = aval - bval;
    }
    if(diff == 0) {
        if(picker_sort_tieb == 'adp') {
            aval = pp_playerDB[a].adp;
            bval = pp_playerDB[b].adp;
            diff = aval - bval;
        }
        else {
            diff = pp_playerDB[a].name < pp_playerDB[b].name ? -1 : 
                  (pp_playerDB[a].name > pp_playerDB[b].name ? 1 : 0);
        }
    }
    return diff;
}

function picker_locked_check(picker_id,submit_id,note_id,is_commish,force_id,
                             waiver_only_str) {
    var pdb = playerDatabaseObj[picker_id];
    var pid = picker_cur_sel[picker_id];
    var player_name = picker_cur_sel[picker_id] == -1 ? "" : pdb[pid].name;
    var pos_star = player_name.indexOf("#");
    if(pos_star < 0) {
        pos_star = player_name.indexOf("*");
        if(pos_star < 0) {
            pos_star = player_name.indexOf("!");
        }
    }
    //alert("checked_locked_player name = " + player_name + " pos=" + pos_star + " note_id=" + note_id + " is_commish=" + is_commish);
    var submit = document.getElementById(submit_id);
    var note = document.getElementById(note_id);
    var force = document.getElementById(force_id);
    var force_p = force.parentNode.parentNode;
    var waiver_only_ids = waiver_only_str.split(",");
    var waiver_only_els = [];
    for (var i = 0,j=0; i < waiver_only_ids.length; i++) {
        var elem = document.getElementById(waiver_only_ids[i]);
        if(elem) {
            waiver_only_els[j++] =
                 document.getElementById(waiver_only_ids[i]);
        }
    }
    if(pos_star > 0) {
        player_name = player_name.substring(0,pos_star);
        var field = document.getElementById(picker_name_store_id[picker_id]);
        //field.innerHTML = player_name;
        note.className = "";
        if(is_commish == 0 ) {
            note.innerHTML = "The selected player (" + player_name + ") is locked, so this add/drop will be submitted as a waiver request.";
            submit.value = "Submit Request";
            force_p.className = "hidden";
            for (var i = 0; i < waiver_only_els.length; i++) {
                waiver_only_els[i].className = "";
            }
        }
        else {
            note.innerHTML = "Even though the selected player (" + player_name + ") is locked, this add/drop will be executed immediately.";
            submit.value = "Perform Add/Drop";
            force_p.className = "";
            force.checked = 0;
            for (var i = 0; i < waiver_only_els.length; i++) {
                waiver_only_els[i].className = "hidden";
            }
        }
    }
    else {
        submit.value = "Perform Add/Drop";
        force_p.className = "";
        force.checked = 0;
        note.innerHTML = "";
        note.className = "hidden";
        for (var i = 0; i < waiver_only_els.length; i++) {
            waiver_only_els[i].className = "hidden";
        }
    }
    return;
}

function check_waiver_claim (obj,submit_id,note_id,waiver_only_str) {
    //alert("check_waiver_claim obj = " + obj.id);
    var submit = document.getElementById(submit_id);
    var note = document.getElementById(note_id);
    var waiver_only_els = [];
    var waiver_only_ids = waiver_only_str.split(",");
    for (var i = 0,j=0; i < waiver_only_ids.length; i++) {
        var elem = document.getElementById(waiver_only_ids[i]);
        if(elem) {
            waiver_only_els[j++] =
                 document.getElementById(waiver_only_ids[i]);
        }
    }
    if(obj.checked) {
        submit.value = "Submit Request";
        note.innerHTML = "This add/drop will be submitted as a waiver request.";
        note.className = "";
        for (var i = 0; i < waiver_only_els.length; i++) {
            waiver_only_els[i].className = "";
        }
    }
    else {
        submit.value = "Perform Add/Drop";
        note.innerHTML = "";
        note.className = "hidden";
        for (var i = 0; i < waiver_only_els.length; i++) {
            waiver_only_els[i].className = "hidden";
        }
    }
    return;
}

function update_salary_cap (picker_id, sal_cap_field, sel_players,
             sal_cap, format, curr_sal_field)  {
    var list = document.getElementById(sel_players);
    var pdb = playerDatabaseObj[picker_id];
    var salary = 0;
    for (var i = 0; i < list.options.length; i++) {
        var player = list.options[i];
        var pid = player.value;
        for (var j = 0; j < pdb.length; j++) {
            if(pdb[j].id == pid) {
                var this_sal = Number(pdb[j].sort_sal);
                salary += this_sal;
                break;
            }
        }
    }
    var avail = sal_cap - salary;
    var sal_cap_el = document.getElementById(sal_cap_field);
    if(format == 'm') {
        var millions = avail/1000000;
        avail = millions.toFixed(0);
        millions = salary/1000000;
        salary = millions.toFixed(0);
    }
    else if(format == 'f') {
        avail = avail.toFixed(2);
        salary = salary.toFixed(2);
    }
    else {
        avail = avail.toFixed(0);
        salary = salary.toFixed(0);
    }
    sal_cap_el.innerHTML = "$" + avail;
    if(curr_sal_field) {
        var curr_sal_el = document.getElementById(curr_sal_field);
        curr_sal_el.innerHTML = "$" + salary;
    }
}

function picker_change_avail (picker_id, pid, delta) {
    var picker = document.getElementById(picker_id);
    if(picker) {
        var ppdb = playerDatabaseObj[picker_id];
        for (var i = 0; i < ppdb.length; i++) {
            if(ppdb[i].id == pid) {
                ppdb[i].avail += delta;
                update_picker(picker_id);
                break;
            }
        }
    }
}

function picker_is_avail (picker_id, pid) {
    var picker = document.getElementById(picker_id);
    var avail = 0;
    if(picker) {
        var ppdb = playerDatabaseObj[picker_id];
        for (var i = 0; i < ppdb.length; i++) {
            if(ppdb[i].id == pid) {
                avail = ppdb[i].avail;
                break;
            }
        }
    }
    return avail;
}
