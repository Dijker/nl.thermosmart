"use strict";

var path			= require('path');

var request			= require('request');
var extend			= require('extend');

var api_url			= 'https://api.thermosmart.com';

var config			= require( path.join(Homey.paths.root, 'config.json') );

var pairing			= {};
		
var self = {
	
	init: function( devices, callback ){
		// we're ready
		callback();
	},
	
	name: {
		set: function( device, name, callback ) {
			// A ThermoSmart device does not have a name
		}
	},
	
	capabilities: {
		target_temperature: {
			get: function( device, callback ){
				getThermosmartInfo( device, function(info){
					callback( info.target_temperature );
				});
			},
			set: function( device, target_temperature, callback ){
				setThermosmartInfo( device, {
					target_temperature: target_temperature
				}, callback)				
			}
		},
		measure_temperature: {
			get: function( device, callback ){
				getThermosmartInfo( device, function(info){
					callback( info.room_temperature );
				});
			}
		}
	},
	
	pair: {
		start: function( callback, emit, data ){
			
			callback({
				client_id: config.client_id
			});
						
			Homey.log('ThermoSmart pairing has started');
			
		},
		
		authorized: function( callback, emit, data ) {
			
			var form = {
				'client_id'		: config.client_id,
				'client_secret'	: config.client_secret,
				'code'			: data.code,
				'redirect_uri'	: data.redirect_uri,
				'grant_type'	: 'authorization_code'
			};
			
			request.post( api_url + '/oauth2/token', {
				form: form,
				json: true
			}, function( err, response, body ){
				if( body.error ) return callback( false );	
				pairing.access_token	= body.access_token;
				pairing.thermostat		= body.thermostat;
				callback( true );
			});
		},
	
		list_devices: function( callback, emit, data ) {
						
			var devices = [{
				data: {
					id				: pairing.thermostat,
					access_token	: pairing.access_token
				},
				name: pairing.thermostat
				
			}];
			
			callback( devices );
			
			pairing = {};
							
		},
	}
	
}

var thermosmartInfoCache = {
	updated_at: new Date("January 1, 1970"),
	data: {}
};

function getThermosmartInfo( device, force, callback ) {
	
	if( typeof force == 'function' ) callback = force;
	
	// serve the cache for at maximum 5 minutes
	if( !force && ((new Date) - thermosmartInfoCache.updated_at) < 1000 * 60 * 5 ) {
		callback(thermosmartInfoCache.data);
	} else {
		call({
			path			: '/thermostat/' + device.id,
			access_token	: device.access_token
		}, function(err, result, body){
			if( err ) return callback(err);
			
			thermosmartInfoCache.updated_at = new Date();
			thermosmartInfoCache.data = body;
			
			callback(thermosmartInfoCache.data);
			
		});
	}
	
}

function setThermosmartInfo( device, json, callback ) {
	call({
		method			: 'PUT',
		path			: '/thermostat/' + device.id,
		access_token	: device.access_token,
		json			: json
	}, function(err, result, body){
		if( err ) return callback(err);
		
		// update thermosmart info
		getThermosmartInfo( device, true, callback );
		
	});	
}

function call( options, callback ) {
		
	// create the options object
	options = extend({
		path			: api_url + '/',
		method			: 'GET',
		access_token	: false,
		json			: true
	}, options);
	
	
	// remove the first trailing slash, to prevent `.nl//foo`
	if( options.path.charAt(0) === '/' ) options.path = options.path.substring(1);
	
	// make the request
	request({
		method: options.method,
		url: api_url + '/' + options.path,
		json: options.json,
		headers: {
			'Authorization': 'Bearer ' + options.access_token
		}
	}, callback);
	
}

module.exports = self;