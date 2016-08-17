'use strict';

var platform      = require('./platform'),
	isEmpty       = require('lodash.isempty'),
	isArray       = require('lodash.isarray'),
	isPlainObject = require('lodash.isplainobject'),
	request = require('request'),
	async = require('async'),
	moment = require('moment-timezone'),
	S = require('string'),
	fioBaseUrl,
	powerBITask,
	azureApiKey,
	azureUrl;

var forecastIO = (params, cb) => {
	let reqParams = `${params.lat},${params.lng}`,
		req = '';

	if (params.hasOwnProperty('time')) {
		reqParams = `${reqParams},${params.time}`;
	}
	req =  fioBaseUrl + reqParams;

	request.get({
		url: req,
		json: true
	}, function (error, response, body) {
		
		if (error)
			cb(error);
		else if (response.statusCode !== 200)
			cb(new Error(response.statusMessage));
		else {
			let fioDatum = {
				datetime: moment.unix(body.currently.time).tz(body.timezone).format(),
				timestamp: body.currently.time,
				precip_intensity: body.currently.precipIntensity,
				temperature: body.currently.temperature,
				humidity: body.currently.humidity,
				wind_speed: body.currently.windSpeed,
			};

			cb(null, fioDatum);
		}
	});
};

var azureMl = (params, cb) => {
	let requestData = {
	  'Inputs': {
	    'input1': {
	      'ColumnNames': [
	        'current_precip_intensity',
	        'current_temperature',
	        'current_humidity',
	        'current_wind_speed',
	        'previous_precip_intensity',
	        'previous_temperature',
	        'previous_humidity',
	        'previous_wind_speed',
	        'previous_tank_condition'
	      ],
	      'Values': [params]
	    }
	  },
	  'GlobalParameters': {}
	};

	request.post({
		url: azureUrl,
		body: requestData,
		json: true,
		auth: {
			bearer: azureApiKey
		}
	}, function (error, response, body) {
		if (error)
			cb(error);
		else if (response.statusCode !== 200)
			cb(new Error(response.statusMessage));
		else {
			cb(null, body);
		}
	});
};

platform.on('data', function (requestId, data) {
	let azureMlResult = [];

	async.waterfall([
		(nextFall) => {
			async.timesSeries(2, function(n, next){
				let params = {
					'time': moment.unix(data.time).add(n, 'day').format('YYYY-MM-DDTHH:MM:SS'),
					'lat': data.latitude,
					'lng': data.longitude
				};

			    forecastIO(params, (err, fioDatum) => {
			    	next(err, fioDatum);
			    });

			}, function(err, fioData) {
				nextFall(err, fioData);
			});	
		},
		(fioData, nextFall) => {
			let ctr = 0,
				predictions = [];

			fioData[0].water_tank_condition = data.water_tank_condition;

			async.timesSeries((fioData.length - 1), (n, next) => {
					let prevItem = fioData[n],
						curItem = fioData[(n + 1)];

					let params = [
						curItem.precipIntensity,
						curItem.temperature,
						curItem.humidity,
						curItem.windSpeed,
						prevItem.precipIntensity,
						prevItem.temperature,
						prevItem.humidity,
						prevItem.windSpeed,
						prevItem.water_tank_condition
					];

					azureMl(params, (error, amlData) => {
						let prediction = {
								timestamp: curItem.datetime,
								water_tank_condition: amlData.Results.output1.value.Values[0][9],
								probability: amlData.Results.output1.value.Values[0][10]
							};

						next(error, prediction);
					});
				}, 
				function(error, azureResult){
					azureMlResult = azureResult;
					nextFall(error);
				});
		},
		(nextFall) => {
			powerBITask.init((error) => {
				nextFall(error);
			});
		},
		(nextFall) => {
			powerBITask.clear((error) => {
				nextFall(error);
			});
		},
		(nextFall) => {
			powerBITask.send(azureMlResult, (error) => {
				nextFall(error);
			});
		}
	], (error) => {
		if(error) {
			platform.sendResult(requestId, null);
			platform.handleException(error);
		}
		else {
			platform.sendResult(requestId, JSON.stringify({
				azure_result: azureMlResult
			}));

			platform.log(JSON.stringify({
				title: 'Smart Agri Service Result',
				input: data,
				result: azureMlResult
			}));
		}
	});
});

platform.once('close', function () {
	platform.notifyClose();
});

platform.once('ready', function (options) {
	fioBaseUrl = `https://api.forecast.io/forecast/${options['fio-api_key']}/`;

	platform.log('Smart Agri service - Forecast.io has been initialized.');

	azureUrl = options['aml-url'];
	azureApiKey = options['aml-api_key'];
	platform.log('Smart Agri service - Azure Machine Learning has been initialized.');

	var PowerBITask = require('./utils/powerBITask');

	let pbiOptions = {},
		pbiIndex = 'pbi-',
		optionKey = '';

	for(let k in options) {
		if (S(k).startsWith(pbiIndex)) {
			optionKey = S(k).chompLeft(pbiIndex).s;
			pbiOptions[optionKey] = options[k];
		}
	}

	powerBITask = new PowerBITask(pbiOptions);
	platform.log('Smart Agri service - Power BI Connector has been initialized.');
	platform.notifyReady();
});