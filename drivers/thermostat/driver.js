'use strict';

const Homey = require('homey');
const ThermoSmart = require('../../lib/ThermoSmart.js');

class ThermoSmartDriver extends Homey.Driver {
	
	onInit() {
		
		new Homey.FlowCardCondition('is_paused')
			.register()
			.registerRunListener( args => {
				return args.device.getThermostat()
					.then( result => {
						return result.source === 'pause';
					});
			});
		
		new Homey.FlowCardAction('set_pause_true')
			.register()
			.registerRunListener( args => {
				return args.device.setThermostatPause(true);
			});
		
		new Homey.FlowCardAction('set_pause_false')
			.register()
			.registerRunListener( args => {
				return args.device.setThermostatPause(false);
			});
		
		new Homey.FlowCardAction('set_outside_temperature')
			.register()
			.registerRunListener( args => {
				return args.device.setThermostat({
					outside_temperature: args.outside_temperature
				});
			});
		
		new Homey.FlowCardAction('unset_outside_temperature')
			.register()
			.registerRunListener( args => {
				return args.device.setThermostat({
					outside_temperature: 'auto'
				});
			});
		
	}
	
	onPair( socket ) {
		
		let device = null;
		
		const url = ThermoSmart.getOAuth2Url();
		const oauth2Callback = new Homey.CloudOAuth2Callback(url);
		oauth2Callback
			.on('url', url => {
				this.log('Got url', url);
				socket.emit('url', url);
			})
			.on('code', code => {
				this.log('Got authorization code');
				
				ThermoSmart.getToken(code)
					.then( res => {
						if( res.status !== 200 ) return socket.emit('error', 'Unknown error');

						device = {
							name: res.data.thermostat,
							data: {
								id: res.data.thermostat
							},
							store: {
								access_token: res.data.access_token,								
							}
						}
						
						socket.emit('authorized');
					})
					.catch( err => {
						this.error(err);
						socket.emit('error', err);
					});			
				
			})
			.generate()
			.catch( err => {
				this.error(err);
				socket.emit('error', err);
			});
			
		socket.on('list_devices', ( data, callback ) => {
			let devices = [];
			if( device ) devices.push(device);
			callback(null, devices);
		});
	}
	
}

module.exports = ThermoSmartDriver;