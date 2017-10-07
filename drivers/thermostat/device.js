'use strict';

const Homey = require('homey');
const ThermoSmart = require('../../lib/ThermoSmart.js');

const API_URL = 'https://api.thermosmart.com';
const WEBHOOK_ID = Homey.env.WEBHOOK_ID;
const WEBHOOK_SECRET = Homey.env.WEBHOOK_SECRET;
const POLL_INTERVAL = 1000 * 60 * 5; // 5 min

class ThermoSmartDevice extends Homey.Device {
	
	onInit() {
		
		this._accessToken = this._getAccessToken();
		this._id = this.getData().id;
		this._api = new ThermoSmart(this._accessToken);
		
		this.registerCapabilityListener('target_temperature', this._onCapabilityTargetTemperature.bind(this));
		
		this._registerWebhook();
		
		this._sync();
		this._syncInterval = setInterval(this._sync.bind(this), POLL_INTERVAL);
	}
	
	onDeleted() {
		this._unregisterWebhook();
	}
	
	_getAccessToken() {
		let store = this.getStore();
		let data = this.getData();
		
		if( store.access_token ) return store.access_token;
		if( data.access_token ) return data.access_token;
		return null;
		
	}
	
	/*
		Thermostat methods
	*/	
	getThermostat() {
		return this._api.getThermostat( this._id );
	}
	
	setThermostat( data ) {
		return this._api.setThermostat( this._id, data );
	}
	
	setThermostatPause( paused ) {
		this._api.setThermostatPause( this._id, paused );
	}
	
	/*
		Capabilities
	*/
	_onCapabilityTargetTemperature( value ) {
		return this.setThermostat({
			target_temperature: value
		});
	}
	
	_sync() {
		this.getThermostat()
			.then( res => {				
				this.setCapabilityValue('target_temperature', res.target_temperature);
				this.setCapabilityValue('measure_temperature', res.room_temperature);
			})
			.catch( err => {
				this.error(err);
				this.setUnavailable(err);
			})
	}
	
	/*
		Webhook methods
	*/
	_registerWebhook() {
		this._webhook = new Homey.CloudWebhook(WEBHOOK_ID, WEBHOOK_SECRET, { thermosmart_id: this._id });
		this._webhook.on('message', this._onWebhookMessage.bind(this));
		this._webhook.register()
			.then(() => {
				this.log('Webhook registered');
			})
			.catch( this.error );
	}
	
	_unregisterWebhook() {
		if( this._webhook ) {
			this._webhook.unregister()
			.then(() => {
				this.log('Webhook unregistered');
			})
			.catch( this.error );
		}			
	}
	
	_onWebhookMessage( args ) {		
		if( args.body && args.body.room_temperature ) {
			this.setCapabilityValue('measure_temperature', args.body.room_temperature);
		}
		
		if( args.body && args.body.target_temperature ) {
			this.setCapabilityValue('target_temperature', args.body.target_temperature);
		}
	}
	
}

module.exports = ThermoSmartDevice;