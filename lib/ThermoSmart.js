'use strict';

const Homey = require('homey');
const axios = require('axios');

const API_URL = 'https://api.thermosmart.com';
const API_CLIENT_ID = Homey.env.CLIENT_ID;
const API_CLIENT_SECRET = Homey.env.CLIENT_SECRET;
const REDIRECT_URL = 'https://callback.athom.com/oauth2/callback/';

class ThermoSmart {
	
	constructor(accessToken) {
		this._accessToken = accessToken;
	}
	
	_call( method, path, data ) {		
		return axios({
			headers: {
				Authorization: `Bearer ${this._accessToken}`
			},
			method: method,
			url: `${API_URL}${path}`,
			data: data
		})
			.then( result => {
				return result.data;
			})
			.catch( err => {
				throw new Error(err.message || err.body);
			})
	}
	
	_get( path ) {
		return this._call('get', path);
	}
	
	_post( path, data ) {
		return this._call('post', path, data);
	}
	
	_put( path, data ) {
		return this._call('put', path, data);
	}
	
	_delete( path ) {
		return this._call('delete', path);
	}
	
	getThermostat( thermostatId ) {
		return this._get(`/thermostat/${thermostatId}`);
	}
	
	setThermostat( thermostatId, data ) {
		return this._put(`/thermostat/${thermostatId}`, data);
	}
	
	setThermostatPause( thermostatId, paused ) {
		return this._post(`/thermostat/${thermostatId}/pause`, {
			pause: paused === true
		});
	}
	
	static getOAuth2Url() {
		return `${API_URL}/oauth2/authorize?response_type=code&client_id=${API_CLIENT_ID}&redirect_uri=${REDIRECT_URL}`;
	}
	
	static getToken(code) {				
		return axios.post(`${API_URL}/oauth2/token`, {
			client_id: API_CLIENT_ID,
			client_secret: API_CLIENT_SECRET,
			code: code,
			redirect_uri: REDIRECT_URL,
			grant_type: 'authorization_code'
		});
	}
	
}

module.exports = ThermoSmart;