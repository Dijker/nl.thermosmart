"use strict";

var path			= require('path');

var request			= require('request');
var extend			= require('extend');

var api_url			= 'https://api.thermosmart.com';
var redirect_uri	= 'https://callback.athom.com/oauth2/callback/';

var pairing			= {};
		
var self = module.exports = {
	
	init: function( devices, callback ){
		// we're ready
		callback();
	},
	
	name: {
		set: function( device, name, callback ) {
			// A ThermoSmart device does not have a name, so we can ignore this
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
				
				if( target_temperature < 5 ) target_temperature = 5;
				if( target_temperature > 30 ) target_temperature = 30;
				
				setThermosmartInfo( device, {
					target_temperature: target_temperature
				}, callback)
				self.realtime(device, 'target_temperature', target_temperature)			
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
						
			Homey.log('ThermoSmart pairing has started...');
			
			// request an authorization url, and forward it to the front-end
			Homey.manager('cloud').generateOAuth2Callback(
				
				// this is the app-specific authorize url
				"https://api.thermosmart.com/oauth2/authorize?response_type=code&client_id=" + Homey.env.client_id + "&redirect_uri=" + redirect_uri,
				
				// this function is executed when we got the url to redirect the user to
				function( err, url ){
					Homey.log('Got url!', url);
					emit( 'url', url );
				},
				
				// this function is executed when the authorization code is received (or failed to do so)
				function( err, code ) {
					
					if( err ) {
						Homey.error(err);
						emit( 'authorized', false )
						return;
					}
					
					Homey.log('Got authorization code!', code);
				
					// swap the authorization code for a token					
					request.post( api_url + '/oauth2/token', {
						form: {
							'client_id'		: Homey.env.client_id,
							'client_secret'	: Homey.env.client_secret,
							'code'			: code,
							'redirect_uri'	: redirect_uri,
							'grant_type'	: 'authorization_code'
						},
						json: true
					}, function( err, response, body ){
						if( err || body.error ) return emit( 'authorized', false );
						pairing.access_token	= body.access_token;
						pairing.thermostat		= body.thermostat;
						emit( 'authorized', true );
					});
				}
			)
			
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