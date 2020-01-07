'use strict';

const Homey = require('homey');
const ThermoSmart = require('../../lib/ThermoSmart.js');

const WEBHOOK_ID = Homey.env.WEBHOOK_ID;
const WEBHOOK_SECRET = Homey.env.WEBHOOK_SECRET;

class ThermoSmartDriver extends Homey.Driver {
	
	onInit() {
		
		this.registerWebhook();
		
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
			
		this._flowTriggerPaused = new Homey.FlowCardTriggerDevice('paused').register();
		this._flowTriggerUnpaused = new Homey.FlowCardTriggerDevice('unpaused').register();
		
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
	
	triggerPaused( device, paused ) {
		if( paused ) {
			return this._flowTriggerPaused.trigger( device );
		} else {
			return this._flowTriggerUnpaused.trigger( device );
		}
		
	}
	
	/*
		Webhook methods
	*/
	registerWebhook() {		
		this.unregisterWebhook()
			.catch(() => {})
			.then(() => {
		
				let ids = [];
				this.getDevices().forEach(device => {
					let data = device.getData();
					let id = data.id;
					ids.push(id);
				});
				
				this._webhook = new Homey.CloudWebhook(WEBHOOK_ID, WEBHOOK_SECRET, { thermosmart_id: ids });
				this._webhook.on('message', this._onWebhookMessage.bind(this));
				return this._webhook.register()
					.then(() => {
						this.log('Webhook registered for ids', ids);
					})
			
			})
			.catch(err => {
				this.error( 'Error registering webhook', err );
			})
	}
	
	unregisterWebhook() {
		
		if( this._webhook ) {
			return this._webhook.unregister()
			.then(() => {
				this.log('Webhook unregistered');
			})
		}			
		
		return Promise.resolve();
	}
	
	_onWebhookMessage( args ) {		
		if( !args.body || !args.body.thermostat ) return;
		
		let thermostatId = args.body.thermostat;
		let device;
		this.getDevices().forEach(device_ => {
			if( device_.getData().id === thermostatId ) device = device_;
		})
		
		if( !device ) return this.error('Got webhook for unknown device');
		
		if( args.body && args.body.room_temperature ) {
			device.setCapabilityValue('measure_temperature', args.body.room_temperature);
		}
		
		if( args.body && args.body.target_temperature ) {
			device.setCapabilityValue('target_temperature', args.body.target_temperature);
		}
		
		if( args.body && args.body.source ) {
			this.triggerPaused( device, args.body.source === 'pause' ).catch( this.error );
		}
	}
	
}

module.exports = ThermoSmartDriver;