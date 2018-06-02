var soap = require('soap');

console.log("Hello.");

var url = 'wsiv.wsdl';

var args = {};

soap.createClient(url, function(err, client) {
  client.getLines(args, function(err, result) {
      console.log(result);
  });
});
