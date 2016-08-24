'use strict';

var platform      = require('./platform'),
	isEmpty       = require('lodash.isempty'),
	isArray       = require('lodash.isarray'),
	isPlainObject = require('lodash.isplainobject'),
	domain = require('domain'),
	request = require('request'),
	async = require('async'),
	moment = require('moment-timezone'),
	config = require('./config.json'),
	S = require('string'),
	ucfirst = require('ucfirst'),
	fioBaseUrl,
	numDaysToPredict,
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
			let dayOfWeek = moment.unix(body.currently.time).tz(body.timezone).format('d'),
				fioDatum = {
					date_time: moment.unix(body.currently.time).tz(body.timezone).format(),
					date: moment.unix(body.currently.time).tz(body.timezone).format('ll'),
					// timestamp : body.currently.time,
					precipitation: body.currently.precipIntensity,
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
			'current_tank_condition',
			'next_precip_intensity',
			'next_temperature',
			'next_humidity',
			'next_wind_speed'
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
			async.timesSeries(numDaysToPredict, function(n, next){
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
				water_tank_condition = (data.water_tank_condition) ? 'Above critical level' : 'Below critical level',
				probability = 1;

			fioData[0].water_tank_condition = data.water_tank_condition;

			async.timesSeries(fioData.length, (n, next) => {
				let curDay = fioData[n],
					nextDay = fioData[(n + 1)],
					forecastData = {};

				for(let i in curDay) {
					let index = ucfirst(S(i).humanize().s);
					forecastData[index] = curDay[i];
				}

				forecastData.Order = (n + 1);
				forecastData['Water tank condition'] = water_tank_condition;
				forecastData.Probability = probability;

				if (nextDay) {
					let params = [
						curDay.precipitation_intensity,
						curDay.temperature,
						curDay.humidity,
						curDay.wind_speed,
						curDay.water_tank_condition,
						nextDay.precipitation_intensity,
						nextDay.temperature,
						nextDay.humidity,
						nextDay.wind_speed
					];

					azureMl(params, (error, amlData) => {
						if (error) {
							return next(error);
						}
						
						water_tank_condition = (amlData.Results.output1.value.Values[0][9] === '1') ? 'Above critical level' : 'Below critical level';
						probability = amlData.Results.output1.value.Values[0][10];
						
						fioData[(n + 1)].water_tank_condition = amlData.Results.output1.value.Values[0][9];
						
						next(null, forecastData);
					});
				} else {
					next(null, forecastData);
				}
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

	let d = domain.create();

	d.once('error', (error) => {
		platform.log(error.stack);
	});

	d.run(() => {
		numDaysToPredict = options.days_to_predict || config.days_to_predict.default;
		numDaysToPredict = parseInt(numDaysToPredict) + 1;

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
});