'use strict';

var PowerBITask = require('./utils/powerBITask');
var authenticationParameters = {
        tenant : 'allanoneone.com',
        client_id : '4f4912c5-76ef-4691-bd6d-eff85944f077',
        client_secret : 'IJdlpVOJn9cI4lRHYEuNaaKcn6rbe+iAeH3F1Ttnke4=',
        username : 'hollyd@allanoneone.com',
        password : 'P@ssw0rd',
        dataset: '46226cfc-6bea-4253-88e4-823c4ded3bdb',
        table: 'Product'
    };
var payload = [
    {
        ProductID: Date.now(),
        Name: 'Adjustable Race 8',
        Category: 'Components 2',
        IsCompete: true,
        ManufacturedOn: '07/30/2014'
    },
    {
        ProductID: Date.now(),
        Name: 'Adjustable Race 600',
        Category: 'Components 6',
        IsCompete: true,
        ManufacturedOn: '07/30/2014'
    }
];

var powerBITask = new PowerBITask(authenticationParameters);
powerBITask.init(function(error) {
    if(error) {
        console.error(error);
    } else {
        powerBITask.send(payload, function(error) {
            if(error) {
                console.error(error);
            } else {
                console.log('success');
            }
        });
    }
});