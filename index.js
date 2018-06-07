const util = require('util');
const soap = require('soap');
const fs = require('fs');
const jsonQuery = require('json-query')

// Loading resources
var url = 'wsiv.wsdl';
var stations_geo = JSON.parse(fs.readFileSync('emplacement-formatted.json', 'utf8'));

// Holds mapping of various Metro line identifiers for various contexts
var metro_id_couples = [
    { line_name: '1', id_stations: '62', id_missions: 'M1'},
    { line_name: '2', id_stations: '67', id_missions: 'M2'},
    // { line_name: '3', id_stations: '68', id_missions: 'M3'},
    // { line_name: '3b', id_stations: '69', id_missions: 'M3b'},
    // { line_name: '4', id_stations: '70', id_missions: 'M4'},
    // { line_name: '5', id_stations: '71', id_missions: 'M5'},
    // { line_name: '6', id_stations: '72', id_missions: 'M6'},
    // { line_name: '7', id_stations: '73', id_missions: 'M7'},
    // { line_name: '7b', id_stations: '74', id_missions: 'M7b'},
    // { line_name: '8', id_stations: '172562', id_missions: 'M8'},
    // { line_name: '9', id_stations: '76', id_missions: 'M9'},
    // { line_name: '10', id_stations: '63', id_missions: 'M10'},
    // { line_name: '11', id_stations: '64', id_missions: 'M11'},
    // { line_name: '12', id_stations: '65', id_missions: 'M12'},
    // { line_name: '13', id_stations: '66', id_missions: 'M13'},
    // { line_name: '14', id_stations: '55098', id_missions: 'M14'}
];

// Keeps count of lines queried/to query to avoid returning prematurely
var linesCount = metro_id_couples.length;
var stationsCount = 0;

// Holds stations populated by buildStations using client.getStations()
var stations = [];

// Final unified object to hold all results
// Created with initial scaffolding in the interest of saving complexity
var unified = {
    lines: [
        {
            linename: '1',
            lineid: 'M1',
            stations: []
        },
        {
            linename: '2',
            lineid: 'M2',
            stations: []
        }
    ]
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///// MAIN ACTION STARTS HERE
///////////////////////////////////////////////////////////////////////////////

// Get all train arrival times for all stations on metro lines in metro_id_couples
for (var i=0; i<metro_id_couples.length; i++) {
    soap.createClient(url, fetchMETROdetails.bind({ line_name: metro_id_couples[i].line_name }));
}

// Playground for testing
// soap.createClient(url, runAction);

function fetchMETROdetails(err, client) {

    // Template request to be filled with IDs of Metro lines
    var args_stations = 
    {
        station: {
            line: {
                id: 'X',
                reseau: {
                    code: 'metro'
                }
            }
        }
    };

    // Generate objects from template for specific metro line
    var lineId_stations = jsonQuery(['[line_name=?]', this.line_name], {data: metro_id_couples}).value.id_stations
    args_stations.station.line.id = lineId_stations;
    var args_working = new Object();
    args_working = args_stations;
    
    client.getStations(args_working, buildStations);

}

function buildStations(err, result) {

    console.log("Lines remaining to process: " + linesCount)

    returnedLine = result.return.argumentLine.code
    returnedStations = result.return.stations
    
    for (var i=0; i<returnedStations.length; i++) {
        var station = {
            line: returnedLine,
            name: returnedStations[i].name,
            id: returnedStations[i].id
        }

        stations.push(station);
    }

    linesCount--;
    stationsCount += returnedStations.length;

    if (linesCount == 0) {
        soap.createClient(url, getMETROtimes)
    }

}

function getMETROtimes(err, client) {

    // Template request to be filled with IDs of Metro lines and station names from earlier call
    var args_mission = {
        station: {
            line: {
                id: 'X'
            },
            name: 'Y'
        },
        direction: {
            sens: '*'
        }
    }

    for (var i=0; i<stations.length; i++) {
        var lineId = jsonQuery(['[line_name=?]', stations[i].line], {data: metro_id_couples}).value.id_missions
        args_mission.station.line.id = lineId;
        args_mission.station.name = stations[i].name;

        args_working = new Object();
        args_working = args_mission;
        client.getMissionsNext(args_working, buildUnified);
    }

}

function buildUnified(err, result) {

    console.log("Stations remaining to process: " + stationsCount)
    var tempStation = {
        stationName: result.return.argumentStation.name,
        stationid: result.return.argumentStation.id,
        missions: []
    }

    for (var i=0; i<result.return.missions.length; i++) {
        tempStation.missions.push({
            direction: result.return.missions[i].direction.name,
            date: result.return.missions[i].stationsDates,
            message: result.return.missions[i].stationsMessages
        })
    }

    for (var i=0; i<unified.lines.length; i++) {
        if (unified.lines[i].linename == result.return.argumentLine.code) {
            unified.lines[i].stations.push(tempStation)
        }
    }

    stationsCount--;

    // Print out entire object once done querying
    if (stationsCount == 0)
        printout(err,unified)

}



// One-off function to associate Metro stations with their geographic coordinates
// Used once to generate static data
// Do not expect to use it again unless there are changes to the Metro network
function coordMatcher(err, result) {

    var stations = result.return.stations;
    
    for (i=0; i<stations.length; i++) {
        var clean_station_name = stations[i].name.toLowerCase().replace(/ *- */g, ' ');
        var search_by_name = jsonQuery(['stations[**].fields[*nom_gare=?]', clean_station_name], {data: stations_geo}).value;
        var search_by_mode = jsonQuery(['[*reseau=?]', 'metro'], {data: search_by_name}).value;

        var line = 
        result.return.argumentLine.code + ';' + 
        result.return.argumentLine.id + ';' + 
        stations[i].id + ';' + 
        stations[i].name + ';' + 
        search_by_mode[0].geo_point_2d[1] + ';' + 
        search_by_mode[0].geo_point_2d[0];

        console.log(line);
    }

    console.log("");
}    

// Normal console.log does not output all details of JSON object
// This takes care of that
function printout(err, result) {
    console.log(util.inspect(result, false, null));
}


///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///// PLEASE IGNORE EVERYTHING BELOW THIS
///// THIS IS FOR PLAYING AROUND WITH THE API
///////////////////////////////////////////////////////////////////////////////

function fetchRERdetails(err, client) {

    var args_rer = {station: {line: {id: 'X',reseau: {code: 'rer'}}}}
    
    // var rer_lines = ['A', 'B', 'C', 'D', 'E']
    var rer_ids = ['77', '78', '1028', '1029', '1030', '1031', '1032', '1033', '70960', '80928', '81323', '355743', '1273', '1275', '25065', '80841', '213760', '264000']

    for (var i=0; i<rer_ids.length; i++) {
        args_rer.station.line.id = rer_ids[i];

        var args_working = new Object();
        args_working = args_rer;
        client.getStations(args_working, coordMatcher);
    }

}

function runAction(err, client) {

    var args_rera = {station: {line: {code: 'A',reseau: {code: 'rer'}}}};
    var args_rerd = {station: {name: 'Vincennes'}};
    var args_allrer = {line: {/*id: 'RA',*/reseau: {code: 'metro'}}};
    var args_allmetro = {line: {/*code: 'A',*/reseau: {code: 'metro'}}};
    var args_alltram = {line: {/*code: 'A',*/ reseau: {code: 'tram'}}};
    var args_mission_rera = {station: {line: {id: 'M1'},name: 'nation'},direction: {sens: '*'}}

    // Get all RER lines
    // client.getLines(args_allrer, printout);
    // Get all Metro lines
    // client.getLines(args_allmetro, printout);
    // Get all Tram lines
    // client.getLines(args_alltram, printout);

    // Get RER A stations
    // client.getStations(args_rera, printout);
    // client.getStations(args_rerd, printout);

    // client.getMissionsNext(args_mission_rera, printout)

}
