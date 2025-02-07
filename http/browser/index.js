function callGlobalHandler(res){
	if($$.httpUnknownResponseGlobalHandler){
		$$.httpUnknownResponseGlobalHandler(res);
	}
}

function generateMethodForRequestWithData(httpMethod) {
	return function (url, data, options, callback) {
		if(typeof options === "function"){
			callback = options;
			options = {};
		}

		const xhr = new XMLHttpRequest();

		xhr.onload = function () {
			if (xhr.readyState === 4 && (xhr.status >= 200 && xhr.status < 300)) {
				const data = xhr.response;
				callback(undefined, data);
			} else {
				if(xhr.status >= 400){
					const error = new Error("An error occured. StatusCode: " + xhr.status);
					callback({error: error, statusCode: xhr.status});
				} else {
					if(xhr.status >= 300 && xhr.status < 400){
						callGlobalHandler(xhr);
					}else{
						console.log(`Status code ${xhr.status} received, response is ignored.`);
					}
				}
			}
		};

		xhr.onerror = function (e) {
			callback(new Error("A network error occurred"));
		};

		xhr.open(httpMethod, url, true);
		//xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
		if(typeof options.headers !== "undefined"){
			for(let name in options.headers){
				xhr.setRequestHeader(name, options.headers[name]);
			}
		}

		if(data && data.pipe && typeof data.pipe === "function"){
			const buffers = [];
			data.on("data", function(data) {
				buffers.push(data);
			});
			data.on("end", function() {
				const actualContents = $$.Buffer.concat(buffers);
				xhr.send(actualContents);
			});
		}
		else {
			if(ArrayBuffer.isView(data) || data instanceof ArrayBuffer) {
				xhr.setRequestHeader('Content-Type', 'application/octet-stream');

				/**
				 * Content-Length is an unsafe header and we cannot set it.
				 * When browser is making a request that is intercepted by a service worker,
				 * the Content-Length header is not set implicitly.
				 */
				xhr.setRequestHeader('X-Content-Length', data.byteLength);
			}
			xhr.send(data);
		}
	};
}

function customFetch(...args){
	return fetch(...args).then(res=>{
		if(res.status >= 300 && res.status < 400){
			callGlobalHandler(res);
		}
		return res;
	}).catch(err=>{
		callGlobalHandler({status: 503, err});
		throw err;
	});
}

function doGet(url, options, callback){
	if (typeof options === "function") {
		callback = options;
		options = undefined;
	}

	customFetch(url, options)
		.then(response => response.text())
		.then(data => callback(undefined, data))
		.catch(err => callback(err));
}

module.exports = {
	fetch: customFetch,
	doPost: generateMethodForRequestWithData('POST'),
	doPut: generateMethodForRequestWithData('PUT'),
	doGet
}