'use strict';

const authService = require('../services/stmina/authService');

const swaggerUI = require('swagger-ui-express'),
	SERVICES = require('../services'),
	Joi = require('joi'),
	path = require('path'),
	basicAuth = require('express-basic-auth'),
	CONFIG = require('../../config'),
	{ MESSAGES, ERROR_TYPES, AVAILABLE_AUTHS, USER_ROLES, ROLE_TYPE } = require('./constants'),
	HELPERS = require('../helpers'),
	utils = require('./utils'),
	multer = require('multer'),
	uploadMiddleware = multer();

let routeUtils = {};

/**
 * function to create routes in the express.
 */
routeUtils.route = async (app, routes = []) => {
	routes.forEach(route => {
		if (route.joiSchemaForSwagger.params && Object.keys(route.joiSchemaForSwagger.params).length) {
			route.joiSchemaForSwagger.params = Joi.object(route.joiSchemaForSwagger.params);
		}
		if (route.joiSchemaForSwagger.query && Object.keys(route.joiSchemaForSwagger.query).length) {
			route.joiSchemaForSwagger.query = Joi.object(route.joiSchemaForSwagger.query);
		}
		if (route.joiSchemaForSwagger.body && Object.keys(route.joiSchemaForSwagger.body).length) {
			route.joiSchemaForSwagger.body = Joi.object(route.joiSchemaForSwagger.body);
		}
		if (route.joiSchemaForSwagger.headers && Object.keys(route.joiSchemaForSwagger.headers).length) {
			route.joiSchemaForSwagger.headers = Joi.object(route.joiSchemaForSwagger.headers);
		}
		let middlewares = [getValidatorMiddleware(route)];
		switch (route.auth) {
			case AVAILABLE_AUTHS.USER:
				middlewares.push(authService.userValidate());
			break;
			case true:
				middlewares.push(authService.adminValidate());     
			default:
			  break;
		  }
		if (route.joiSchemaForSwagger.formData) {
			const keys = Object.keys(route.joiSchemaForSwagger.formData);
			keys.forEach((key) => {
				middlewares.push(uploadMiddleware.single(key));
			});
		};
		app.route(route.path)[route.method.toLowerCase()](...middlewares, getHandlerMethod(route));
	});
	createSwaggerUIForRoutes(app, routes);
};

/**
 * function to validate request body/params/query/headers with joi schema to validate a request is valid or not.
 * @param {*} route 
 */
let joiValidatorMethod = async (request, route) => {
	if (route.joiSchemaForSwagger.params && Object.keys(route.joiSchemaForSwagger.params).length) {
		request.params = await route.joiSchemaForSwagger.params.validate(request.params);
	}
	if (route.joiSchemaForSwagger.body && Object.keys(route.joiSchemaForSwagger.body).length) {
		request.body = await route.joiSchemaForSwagger.body.validate(request.body);
	}
	if (route.joiSchemaForSwagger.query && Object.keys(route.joiSchemaForSwagger.query).length) {
		request.query = await route.joiSchemaForSwagger.query.validate(request.query);
	}
	if (route.joiSchemaForSwagger.headers && Object.keys(route.joiSchemaForSwagger.headers).length) {
		let headersObject = await route.joiSchemaForSwagger.headers.validate(request.headers);
		request.headers.authorization = ((headersObject || {}).value || {}).authorization;
	}
};

/**
 * middleware to validate request body/params/query/headers with JOI.
 * @param {*} route 
 */
let getValidatorMiddleware = (route) => {
	return (request, response, next) => {
		joiValidatorMethod(request, route).then((result) => {
			return next();
		}).catch((err) => {
			let error = utils.convertErrorIntoReadableForm(err);
			let responseObject = HELPERS.responseHelper.createErrorResponse(error.message.toString(), ERROR_TYPES.BAD_REQUEST);
			return response.status(responseObject.statusCode).json(responseObject);
		});
	};
}

/**
 * middleware
 * @param {*} handler 
 */
let getHandlerMethod = (route) => {
	let handler = route.handler
	return (request, response) => {
		let payload = {
			...((request.body || {}).value || {}),
			...((request.params || {}).value || {}),
			...((request.query || {}).value || {}),
			file: (request.file || {}),
			user: (request.user ? request.user : {}),
		};
		//request handler/controller
		if (route.getExactRequest) {
			request.payload = payload;
			payload = request
		}
		handler(payload)
			.then((result) => {
				if (result.filePath) {
					let filePath = path.resolve(__dirname + '/../' + result.filePath)
					return response.status(result.statusCode).sendFile(filePath)
				} else if (result.redirectUrl) {
					return response.redirect(result.redirectUrl);
				}
				response.status(result.statusCode).json(result);
			})
			.catch((err) => {
				console.log('Error is ', err);
				if (!err.statusCode && !err.status) {
					err = HELPERS.responseHelper.createErrorResponse(MESSAGES.SOMETHING_WENT_WRONG, ERROR_TYPES.INTERNAL_SERVER_ERROR);
				}
				response.status(err.statusCode).json(err);
			});
	};
};

/**
 * function to create Swagger UI for the available routes of the application.
 * @param {*} app Express instance.
 * @param {*} routes Available routes.
 */
let createSwaggerUIForRoutes = (app, routes = []) => {
	// const swaggerInfo = CONFIG.swagger.info;
	// const swJson = SERVICES.swaggerService;
	// swJson.swaggerDoc.createJsonDoc(swaggerInfo);
	// routes.forEach(route => {
	// 	swJson.swaggerDoc.addNewRoute(route.joiSchemaForSwagger, route.path, route.method.toLowerCase(), route.auth);
	// });

	
	const CSS_URL = "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.6.0/swagger-ui.min.css";
	const swaggerDocument = require('../../swagger.json');
	let swagger_credential = {}
	swagger_credential[`${process.env.DOCUMENTATION_USER}`] = process.env.DOCUMENTATION_PASSWORD
	app.use('/documentation',swaggerUI.serve, swaggerUI.setup(swaggerDocument, {
		customCss:
		  '.swagger-ui .opblock .opblock-summary-path-description-wrapper { align-items: center; display: flex; flex-wrap: wrap; gap: 0 10px; padding: 0 10px; width: 100%; }',
		customCssUrl: CSS_URL,
	  }));
};

module.exports = routeUtils;
