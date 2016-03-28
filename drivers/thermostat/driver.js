"use strict";

var path			= require('path');

var request			= require('request');
var extend			= require('util')._extend;

var api_url			= 'https://api.thermosmart.com';
var redirect_uri	= 'https://callback.athom.com/oauth2/callback/';

var devices = {};

var self = module.exports = {

	init: function( devices_data, callback ){

		devices_data.forEach(initDevice);

		// we're ready
		callback();

		Homey.manager('flow').on('action.set_pause_true', function( callback, args ){
			call({
				method			: 'POST',
				path			: '/thermostat/' + args.device.id + '/pause',
				access_token	: args.device.access_token,
				json			: {
					pause: true
				}
			}, function(err, result, body){
				if( err ) return callback(err);
				callback( null, true );
			});
		})

		Homey.manager('flow').on('action.set_pause_false', function( callback, args ){
			call({
				method			: 'POST',
				path			: '/thermostat/' + args.device.id + '/pause',
				access_token	: args.device.access_token,
				json			: {
					pause: false
				}
			}, function(err, result, body){
				if( err ) return callback(err);
				callback( null, true );
			});
		})

		Homey.manager('flow').on('action.set_outside_temperature', function( callback, args ){
			call({
				method			: 'PUT',
				path			: '/thermostat/' + args.device.id,
				access_token	: args.device.access_token,
				json			: {
					outside_temperature: args.outside_temperature
				}
			}, function(err, result, body){
				if( err ) return callback(err);
				callback( null, true );
			});
		})
	},

	capabilities: {
		target_temperature: {
			get: function( device_data, callback ){

				var device = devices[ device_data.id ];
				if( typeof device == 'undefined' ) return callback( new Error("invalid_device") );

				callback( null, device.state.target_temperature );
			},
			set: function( device_data, target_temperature, callback ){

				var device = devices[ device_data.id ];
				if( typeof device == 'undefined' ) return callback( new Error("invalid_device") );

				// limit temperature
				if( target_temperature < 5 ) 	target_temperature = 5;
				if( target_temperature > 30 ) 	target_temperature = 30;

				// update if different
				if( target_temperature != device.state.target_temperature ) {

					device.state.target_temperature = target_temperature;

					updateThermosmart( device_data, {
						target_temperature: target_temperature
					});

					self.realtime(device_data, 'target_temperature', target_temperature)
				}

				callback( null, device.state.target_temperature );
			}
		},
		measure_temperature: {
			get: function( device_data, callback ){

				var device = devices[ device_data.id ];
				if( typeof device == 'undefined' ) return callback( new Error("invalid_device") );

				callback( null, device.state.measure_temperature );
			}
		}
	},

	pair: function( socket ) {

		Homey.log('ThermoSmart pairing has started...');

		var device = {
			data: {
				id				: undefined,
				access_token	: undefined
			},
			name: undefined
		};

		// request an authorization url, and forward it to the front-end
		Homey.manager('cloud').generateOAuth2Callback(

			// this is the app-specific authorize url
			api_url + "/oauth2/authorize?response_type=code&client_id=" + Homey.env.CLIENT_ID + "&redirect_uri=" + redirect_uri,

			// this function is executed when we got the url to redirect the user to
			function( err, url ){
				Homey.log('Got url!', url);
				socket.emit( 'url', url );
			},

			// this function is executed when the authorization code is received (or failed to do so)
			function( err, code ) {

				if( err ) {
					Homey.error(err);
					socket.emit( 'authorized', false )
					return;
				}

				Homey.log('Got authorization code!');

				// swap the authorization code for a token
				request.post( api_url + '/oauth2/token', {
					form: {
						'client_id'		: Homey.env.CLIENT_ID,
						'client_secret'	: Homey.env.CLIENT_SECRET,
						'code'			: code,
						'redirect_uri'	: redirect_uri,
						'grant_type'	: 'authorization_code'
					},
					json: true
				}, function( err, response, body ){
					if( err || body.error ) return socket.emit( 'authorized', false );
					Homey.log('Authorized!')

					device.name 				= body.thermostat;
					device.data.id 				= body.thermostat;
					device.data.access_token 	= body.access_token;

					socket.emit( 'authorized', true );
				});
			}
		)

		socket.on('list_devices', function( data, callback ) {
			callback( null, [ device ] );

		});

		socket.on('add_device', function( device, callback ){
			initDevice( device.data );
			callback( null, true );
		})

	},
	
	deleted: function( device_data ) {
				
		if( devices[ device_data.id ] ) {
			if( devices[ device_data.id ].pollInterval ) {
				clearInterval( devices[ device_data.id ].pollInterval );
			}
			delete devices[ device_data.id ];
		}
		
	}

}

/*
	Initialize a device by creating an object etc
*/
function initDevice( device_data ) {

	// create the device object
	devices[ device_data.id ] = {
		state: {
			target_temperature: false,
			measure_temperature: false
		}
	}

	// add webhook listener
	registerWebhook( device_data );
	
	// get initial state
	getThermosmart( device_data );
	
	// update state every 15 mins
	devices[ device_data.id ].pollInterval = setInterval(function(){
		getThermosmart( device_data );
	}, 1000 * 60 * 15);

}

/*
	Get a Thermosmart's state
*/
function getThermosmart( device_data, callback ) {
	callback = callback || function(){}

	var device = devices[ device_data.id ];
	if( typeof device == 'undefined' ) return callback( new Error("invalid_device") );
	
	// get initial state
	call({
		path			: '/thermostat/' + device_data.id,
		access_token	: device_data.access_token
	}, function(err, result, body){
		if( err ) return callback(err);		

		if( device.state.target_temperature != body.target_temperature ) {
			device.state.target_temperature 	= body.target_temperature;
			self.realtime(device_data, 'target_temperature', device.state.target_temperature)
		}
		
		if( device.state.measure_temperature != body.room_temperature ) {
			device.state.measure_temperature  = body.room_temperature;
			self.realtime(device_data, 'measure_temperature', device.state.measure_temperature)
		}
		
		callback( null, true );

	});
}

/*
	Update a thermosmart to their API
*/
function updateThermosmart( device_data, json, callback ) {
	callback = callback || function(){}

	call({
		method			: 'PUT',
		path			: '/thermostat/' + device_data.id,
		access_token	: device_data.access_token,
		json			: json
	}, function(err, result, body){
		if( err ) return callback(err);
		callback( null, true );

		devices[ device_data.id ].lastUpdated = new Date();
	});
}

/*
	Make an API call
*/
function call( options, callback ) {
	callback = callback || function(){}

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

/*
	Listen on a webook
	TODO: test with > 1 devices
*/
function registerWebhook( device_data ) {

	Homey.manager('cloud').registerWebhook(Homey.env.WEBHOOK_ID, Homey.env.WEBHOOK_SECRET, {
		thermosmart_id: device_data.id
	}, function onMessage( args ){

		Homey.log("Incoming webhook for Thermosmart", device_data.id, args);

		var device = devices[ device_data.id ];
		if( typeof device == 'undefined' ) return callback( new Error("invalid_device") );

		if( ((new Date) - device.lastUpdated) < (30 * 1000) ) {
			return Homey.log("Ignored webhook, just updated the Thermostat!");
		}

		if( args.body.target_temperature && args.body.target_temperature != device.state.target_temperature ) {
			device.state.target_temperature = args.body.target_temperature;
			self.realtime(device_data, 'target_temperature', device.state.target_temperature)
		}

		if( args.body.room_temperature && args.body.room_temperature != device.state.measure_temperature ) {
			device.state.measure_temperature = args.body.room_temperature;
			self.realtime(device_data, 'measure_temperature', device.state.measure_temperature)
		}

	}, function callback(){
		Homey.log("Webhook registered for Thermosmart", device_data.id);
	});
}