'use strict';

const Homey = require('homey');
const ThermoSmart = require('../../lib/ThermoSmart.js');

const API_URL = 'https://api.thermosmart.com';
const POLL_INTERVAL = 1000 * 60 * 5; // 5 min

class ThermoSmartDevice extends Homey.Device {
	
	onInit() {
		
		this._accessToken = this._getAccessToken();
		this._id = this.getData().id;
		this._api = new ThermoSmart(this._accessToken);
		
		this.registerCapabilityListener('target_temperature', this._onCapabilityTargetTemperature.bind(this));
				
		this._sync();
		this._syncInterval = setInterval(this._sync.bind(this), POLL_INTERVAL);
	}
	
	_getAccessToken() {
		let store = this.getStore();
		let data = this.getData();
		
		if( store.access_token ) return store.access_token;
		if( data.access_token ) return data.access_token;
		return null;
		
	}
	
	onAdded() {
		this.getDriver().ready(() => {
			this.getDriver().registerWebhook();
		});
	}
	
	onDeleted() {
		this.getDriver().ready(() => {
			this.getDriver().registerWebhook();
		});
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
				this.setAvailable();
				this.setCapabilityValue('target_temperature', res.target_temperature);
				this.setCapabilityValue('measure_temperature', res.room_temperature);
			})
			.catch( err => {
				this.error(err);
				this.setUnavailable(err);
			})
	}
	
}

module.exports = ThermoSmartDevice;