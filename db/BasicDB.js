/*
    An OpenDSU  BasicDB is a simple noSQL database
    The DB is used with a concept of "table" and rows (records) that have multiple versions
    The support for multiple versions is offered by getVersions function and by automatically managing 2 fields in the records:
         - the "__version" field
         - the "__previousRecord" field  pointing to the previous version of the record

    As you can see, nothing is ever really updated, even the deletion is done by marking the record with the field "deleted"
 */

const ObservableMixin  = require("../utils/ObservableMixin");
const { v4: uuid } = require('uuid');

function BasicDB(storageStrategy){
    let self = this;
    ObservableMixin(this);
    /*
        Get the whole content of the table and asynchronously return an array with all the  records satisfying the condition tested by the filterFunction
     */
    this.filter = function(tableName, filterFunction, callback){
        storageStrategy.filterTable(tableName, filterFunction, callback);
    };

    this.query = this.filter;

    function getDefaultCallback(message, tableName, key){
        return function (err,res){
            if(err){
                console.log(message,err);
            }else {
                console.log(message,`in table ${tableName} for key ${key} at version ${res.__version}`);
            }

        }
    }

    /*
      Insert a record, return error if already exists
    */
    this.insertRecord = function(tableName, key, record, callback){
        callback = callback?callback:getDefaultCallback("Inserting a record", tableName, key);
        record.__version = 0;
        record.__uuid = uuid();
        record.__timestamp = Date.now();
        storageStrategy.insertRecord(tableName, key, record, callback);
    };


    /*
        Update a record, does not return an error if does not exists
     */
    this.upsertRecord = function(tableName, key, record, callback){
        callback = callback?callback:getDefaultCallback("Updating a record", tableName, key);

        function doVersionIncAndUpdate(){
            record.__version++;
            record.__timestamp = Date.now();
            const previousUuid = record.__uuid;
            record.__uuid = uuid();

            if(record.__version == 0){
                storageStrategy.insertRecord(tableName, key, record, callback);
            } else {
                record.__previousUuid = previousUuid
                storageStrategy.updateRecord(tableName, key, record, callback);
            }
        }

        if(record.__version === undefined){
            self.getRecord(tableName, key, function(err,res){
                if(err || !res){
                    record = {__version:-1};
                }
                if (res) {
                    record = Object.assign(res, record)
                }
                doVersionIncAndUpdate();
            });
        } else {
            doVersionIncAndUpdate()
        }
    };

    /*
        Update a record, does not return an error if does not exists
     */
    this.updateRecord = function(tableName, key, record, callback){
        callback = callback?callback:getDefaultCallback("Updating a record", tableName, key);

        function doVersionIncAndUpdate(){
            record.__version++;
            record.__timestamp = Date.now();
            const previousUuid = record.__uuid;
            record.__uuid = uuid();

            if(record.__version == 0){
                storageStrategy.insertRecord(tableName, key, record, callback);
            } else {
                record.__previousUuid = previousUuid
                storageStrategy.updateRecord(tableName, key, record, callback);
            }
        }

        if(record.__version === undefined){
            self.getRecord(tableName, key, function(err,res){
                if(err || !res){
                    res = {__version:-1};
                }
                if (res) {
                    record.__previousUuid = res.__uuid;
                }
                record.__version = res.__version;
                doVersionIncAndUpdate();
            });
        } else {
            doVersionIncAndUpdate()
        }
    };

    /*
        Get a single row from a table
     */
    this.getRecord = function(tableName, key, callback){
        storageStrategy.getRecord(tableName, key, function(err,res){
            if(err || res.__deleted){
                return callback( createOpenDSUErrorWrapper(`Missing record in table ${tableName} and key ${key}`, err));
            }
            callback(undefined,res);
        });
    };

    /*
      Get the history of a record, including the deleted versions
   */
    this.getHistory = function(tableName, key, callback){
        storageStrategy.getRecord(tableName, key, function(err,res){
            if(err){
                return callback( createOpenDSUErrorWrapper(`No history for table ${tableName} and key ${key}`, err));
            }
            callback(undefined, self.getRecordVersions(res));
        });
    };

    /*
      Delete a record
     */
    this.deleteRecord = function(tableName, key, callback){
        self.getRecord(tableName, key, function(err, record){
            record.__version++;
            record.__timestamp = Date.now();
            record.__deleted = true;
            storageStrategy.updateRecord(tableName, key, record, callback);
        })
    };

    this.getRecordVersions = function(record){
        let arrRes = []
        while(record){
            arrRes.unshift(record);
            record = record.__previousRecord;
        }
        return arrRes;
    }
}

module.exports = BasicDB;