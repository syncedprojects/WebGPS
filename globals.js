/**
 * Global variables
 **/
var datepicker_ops = {autoclose: true, format : 'dd/mm/yyyy', weekStart: 1, language: locale};

var volatileEventName = "click";

var UniversalModal = $('#UniversalModal');

/* Node.js, socket.io variables */
var peopleIds   = {};
var peopleNames = {};

/* GOOGLE MAPS API */
var myGlobalPos;
var map;
var markers              = {};
var usersGlobalPositions = {};
var my_map_marker;
var member_count         = 0;

/* GEOLOCATION API */
var watchId;
var navGeoLoc = navigator.geolocation;

/* NODE.JS API */
var baseURL          = location.protocol + '//' + location.hostname + ':';
var socketIOPort     = 3700;
var socketIOLocation = baseURL + socketIOPort;
var conn_options = {
    //host: 'www.simple-gps.uz',
    //path: '/',
    //ca: ca,
    secure: true,
    rejectUnauthorized: false
};
var socket = null;

// resize window event definition
function triggerEvent(element, eventName) {

    var event;
    if (document.createEvent) {
        event = document.createEvent('HTMLEvents');
        event.initEvent(eventName, true, true);
    } else {
        event = document.createEventObject();
        event.eventType = eventName;
    }

    event.eventName = eventName;
    if (document.createEvent) {
        element.dispatchEvent(event);
    }
    else {
        if (eventName === 'resize') {
            var savedWidth = document.documentElement.style.width;
            document.documentElement.style.width = '100%';
            setTimeout(function() {
                document.documentElement.style.width = savedWidth;
            }, 50);
        } else {
            element.fireEvent('on' + event.eventType, event);
        }
    }
}

var get_group_members = function(members_ids) {

    // get user data and append them to group's users table
    $.ajax({
        method: 'POST',
        url: 'get-group-members',
        dataType: 'JSON',
        data: {
            members_ids: members_ids
        },
        beforeSend: function () {
            $('#ajax_loader_div').show();
        },
        success: function(data) {
            //
            var table_body = $('.users-table-panel table tbody');
            table_body.empty();
            table_body.append(data.users_row_html);
            $('html, body').animate({
                scrollTop: $('.users-table-panel').offset().top - 20
            }, 500);
            $("[data-toggle='tooltip']").tooltip();
        },
        complete: function() {
            setTimeout(function() {
                $('#ajax_loader_div').fadeOut();
            }, 500);
        }
    });
};

var get_user_row_html = function(user_id) {

    // get user data and append them to group's users table
    $.ajax({
        method: 'POST',
        url: 'get-user-row-html',
        dataType: 'JSON',
        data: {
            user_id: user_id
        },
        beforeSend: function () {
            $('#ajax_loader_div').show();
        },
        success: function(data) {
            //
            var table_body = $('.users-table-panel table tbody');
            table_body.empty();
            table_body.append(data.user_row_html);
            $('html, body').animate({
                scrollTop: $('.users-table-panel').offset().top - 20
            }, 500);
            $("[data-toggle='tooltip']").tooltip();
        },
        complete: function() {
            setTimeout(function() {
                $('#ajax_loader_div').fadeOut();
            }, 500);
        }
    });
};

var show_universal_modal = function(title_html, body_html) {

    UniversalModal.find('.modal-title').html(title_html);
    UniversalModal.find('.modal-body').html(body_html);
    UniversalModal.modal('show');
};

$(document).on('ready', function(e) {

    if (jQuery.browser.mobile) {
        volatileEventName = "touchend";
    } else {
        volatileEventName = "click";
    }

    $.ajaxSetup({
        cache: false,
        data: {
            '_token': $('meta[name="csrf-token"]').attr('content')
        }
    });

    // empty modal window content on close
    UniversalModal.on('hidden.bs.modal', function () {
        UniversalModal.find('.modal-title').html('');
        UniversalModal.find('.modal-body').html('');
    });
});