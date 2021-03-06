/**
 * TastyGoogleReader
 *
 * Copyright (C) 2009 Björn Weghenkel
 *
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation; either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program; if not, see <http://www.gnu.org/licenses/>.
 */


var TastyGoogleReader =
{
    responseList:   [],
    dbFile:         null,
    dbConn:         null,
	
    regexpLabel:    /user\/[0-9]+\/label\/(.*)/i,


    // initialization code
    onLoad: function() {
        dump( "TastyGoogleReader " );
        TastyRequestObserver.register();
        gBrowser.tabContainer.addEventListener( "TabClose", this.onTabRemoved, false );
        dump( "initialized\n" );
    },

	
    /**
     * returns true if there are response for this tabId
     */
    knowsResponse: function( tabId ) {

        for( var i = 0; i < this.responseList.length; i++ ) {
            if( this.responseList[i].tabId == tabId )
                return true;
        }

        return false;
    },


    /**
     * removes response with the given tabId from list
     */
    removeResponse: function( tabId ) {

        for( var i = 0; i < this.responseList.length; i++ ) {
            if( this.responseList[i].tabId == tabId ) {
                this.responseList.splice( i, 1 );
                return true;
            }
        }

        return false;
    },


    /**
     * saves response in responseList. if there's already a response
     * with this tabId it will be removed.
     */
    rememberResponse: function( response ) {
        this.removeResponse( response.tabId );
        this.responseList.push( response );
        return;
    },


    /**
     * if there's already an entry for this tabId, merge the items
     */
    mergeResponse: function( response ) {

        try {

            /// for every response in list...
            for( var r = 0; r < this.responseList.length; r++ ) {

                /// right response?
                if( this.responseList[r].tabId == response.tabId ) {

                    /// for every new item...
                    for( var i = 0; i < response.items.length; i++ ) {

                        var newItemId = response.items[i].id;
                        var itemNew = true;

                        /// item already in item list?
                        for( var j = 0; j < this.responseList[r].items.length; j++ ) {

                            ///
                            if( this.responseList[r].items[j].id == newItemId ) {
                                itemNew = false;
                                break;
                            }

                        }

                        /// item not in list? add it!
                        if( itemNew ) {
                            this.responseList[r].items.push( response.items[i] );
                        }

                    } /// for every new item

                    return;

                } /// if right response

            } /// for every response

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }

        return;
    },

	
    /**
     * event handler vor removed tabs
     */
    onTabRemoved: function( event ) {
        var tabId = event.target.linkedBrowser.parentNode.id;
        this.removeResponse( tabId );
        return;
    },

  
    /**
     * that's the important part! :-)
     *
     * preocesses a response object: etract keywords, rate items, write
     * keywords to DB...
     */
    processResponse: function( response, topDoc ) {

        try {

            /// set status
            //topDoc.getElementById("loading-area-text").textContent = "Thinking...";

            /// items...
            for( var i = 0; i < response.items.length; i++ ) {

                var item = response.items[i];
                var wordList = this.extractWordsFromItem( item );
                item.keywords = wordList;	/// save the results for later
                this.rateItem( item );

                //dump( wordList.length + ": " + wordList + "\n" );

                /// modifiy title
                response.items[i].title = "[" + response.items[i].rating.toFixed(2) + "] " + response.items[i].title;

                /// set status
                topDoc.getElementById("loading-area-text").textContent = Math.round( 100*(i+1)/response.items.length ) + "%";
            }

            /// set status back to original
            topDoc.getElementById("loading-area-text").textContent = "Loading...";

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }

        return response;
    },


    /**
     * extracts words from a news item
     */
    extractWordsFromItem: function( item ) {
		
        try {

            /// did we already do the work of extracting the keywords?
            if( item.keywords )
                return item.keywords;

            var words = [];
            var newWords = [];

            /// add tags and streamId
            //for( var i = 0; i < item.categories.length; i++ ) {
            //    var match = item.categories[i].match( this.regexpLabel );
            //    if( match )
            //        words.push( match[1] );
            //}
            //words.push( item.origin.streamId );

            /// author
            if( item.author ) {
                words.push( "author: " + item.author );
            }

            /// extract words from title
            if( item.title ) {
                newWords = this.extractWordsFromString( this.utf8to16( item.title ) );
                for( i = 0; i < newWords.length; i++ )
                    words.push( newWords[i] );
            }

            /// extract summary
            newWords = [];
            if( item.summary ) {

                var summary = item.summary.content;

                if( summary.search( "<" ) > -1 ) {
                    /// probably html content
                    newWords = this.extractWordsFromHtml( summary );
                    //dump( "summary: " + newWords + "\n" );
                } else {
                    /// probably plaintext
                    newWords = this.extractWordsFromString( this.utf8to16( summary ) );
                }

                for( i = 0; i < newWords.length; i++ )
                    words.push( newWords[i] );
            }

            /// extract content
            newWords = [];
            if( item.content ) {

                var content = item.content.content;

                if( content.search( "<" ) > -1 ) {
                    /// probably html content
                    newWords = this.extractWordsFromHtml( content );
                    //dump( "content: " + newWords + "\n" );
                } else {
                    /// probably plaintext
                    newWords = this.extractWordsFromString( this.utf8to16( content ) );
                }

                for( i = 0; i < newWords.length; i++ )
                    words.push( newWords[i] );
            }

            return words;

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }

    },
	

    /**
     * Here we decide what counts as a word what doesn't.
     */
    extractWordsFromString: function( s ) {

        try {

            var word;
            var words = [];
            /**
             * \u00DF = ß
             */
            var rexp = /([A-ZÄÖÜ][0-9A-ZÄÖÜß]+[0-9A-ZÄÖÜß])/gi;

            while( ( word = rexp.exec( s ) ) )
                words.push( word[1].toLowerCase() );

            return words;
            
        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }

    },
	
	
    /**
     * rates a item with a bayesian classifier
     */
    rateItem: function( item ) {

        try {

            var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                            .getService(Components.interfaces.nsIPrefService);
            prefs = prefs.getBranch("extensions.tastygooglereader.");

            var numOfRelevantWords = prefs.getIntPref( "num_of_relevant_words" );
            
            this.getDbConn();
            var feed_id = this.getFeedIdForItem( item );

            /// make sure, every keyword is present in db with default values
            var query = "INSERT OR IGNORE INTO Words (feed_id,word) VALUES(" + feed_id + ",'"
                      + item.keywords.join( "'); INSERT OR IGNORE INTO Words (feed_id,word) VALUES(" + feed_id + ",'" )
                      + "')";
            //dump( query + "\n" );
            this.dbConn.executeSimpleSQL( query );

            /// get relevance baseline
            query = "SELECT MIN(5000,10000*SUM(tofu)/SUM(tofu+spam)) AS baseline FROM Words WHERE feed_id = " + feed_id;
            var statement = this.dbConn.createStatement( query );
            statement.executeStep();
            var baseline = statement.row.baseline;
            statement.reset();

            var rows  = []; // for the db results
            var rows0 = []; // for the 'global' db results

            var minWord = 0;
            var maxWord = 250;

            /// get rating for keywords in small steps. a huge query can be too
            /// much for sqlite
            do {

                /// get rating for each keyword
                query = "SELECT word, tofu AS good, spam AS bad, ABS(" + baseline + "-10000*tofu/(tofu+spam)) AS relevance FROM Words WHERE feed_id = " + feed_id + " AND ( word = '"
                      + item.keywords.slice(minWord,maxWord).join( "' OR word = '" ) + "' ) ORDER BY relevance DESC LIMIT " + numOfRelevantWords;
                //dump( query + "\n" );
                statement = this.dbConn.createStatement( query );

                /// remember all the results 'cause we want to reset the statements
                while( statement.executeStep() ) {

                    var word = statement.row.word;
                    var good = statement.row.good;
                    var bad  = statement.row.bad;

                    rows.push( { word: word, good: good, bad: bad } );

                    /// okay, for every feed-specific word stats, we also want to know the global stats
                    query = "SELECT SUM(tofu) AS good, SUM(spam) AS bad FROM Words WHERE word = '" + word + "'";
                    var statement0 = this.dbConn.createStatement( query );
                    statement0.executeStep();
                    rows0.push( { word: word, good: statement0.row.good - good, bad: statement0.row.bad - bad } );
                    statement0.reset();

                }

                statement.reset();
                minWord = maxWord;
                maxWord = maxWord + 250;

            } while( minWord < item.keywords.length );

            /// sort list of rows
            rows.sort( this.sortRows );

            /// remove duplicates
            for( var i = 0; i < rows.length-1; i++ )
                while( rows[i+1] && rows[i].word == rows[i+1].word ) {
                    rows.splice( i, 1 );
                    rows0.splice( i, 1 );
                }

            var product_f1 = 1.0;
            var product_f2 = 1.0;
            var s  = prefs.getIntPref( "weight_of_uncertainty" );    // strength of a-priori information (x=0.5)
            var s0 = prefs.getIntPref( "max_weight_of_global" );
            var x  = 0.5;    // assumed a-priori probability for haminess
            var N  = Math.min( numOfRelevantWords, rows.length );

            dump( "most relevant words for '" + item.title + "':\n" );
            for( i = 0; i < N; i++ ) {
                var n  = rows[i].good  + rows[i].bad;
                var p  = ( n != 0 ) ? rows[i].bad / n : 0.5;
                var q  = 1.0 - p;
                var n0 = rows0[i].good + rows0[i].bad;  /// # for global stats
                var p0 = ( n0 != 0 ) ? rows0[i].bad / n0 : 0.5;
                var q0 = 1.0 - p0;
                    n0 = Math.min( s0, n0 );    // limit effect of global stats
                //dump( "n0: " + n0 + "\n" );
                //dump( "p0: " + p0 + "\n" );
                //dump( "q0: " + q0 + "\n" );
                product_f1 = product_f1 * ( s*x + n0*p0 + n*p ) / ( s + n0 + n );
                product_f2 = product_f2 * ( s*x + n0*q0 + n*q ) / ( s + n0 + n );
                dump( rows[i].word + ": " + q + "\n" );
            }

            var H = this.chi2P( -2*Math.log( product_f1 ), 2*N );
            var S = this.chi2P( -2*Math.log( product_f2 ), 2*N );

            //dump( "product_f1: " + product_f1 + "\n" );
            //dump( "product_f2: " + product_f2 + "\n" );
            //dump( "H: " + H + "\n" );
            //dump( "S: " + S + "\n" );

            //dump( product1 + " / " + product2 + "\n" );
            item.rating = ( 1.0 + S - H ) / 2.0;

            return;

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        } finally {
            if( statement )
                statement.reset();
        }
        
    },


    chi2P: function( chi, df ) {
        var m = chi / 2.0;
        var term = Math.exp(-m);
        var sum = term;
        for( var i = 1; i < df/2; i++ ) {
            term *= m / i;
            sum += term
        }
        return Math.min( 1.0, sum );
    },
	

    /**
     * Returns the Tab-ID for a given HTTP request.
     */
    getTabIDfromDOM: function( aChannel ) {

        var notificationCallbacks = null;
        var callback = null;

        try {

            /// try the standard method
            notificationCallbacks = aChannel.notificationCallbacks ? aChannel.notificationCallbacks : aChannel.loadGroup.notificationCallbacks;
            callback = notificationCallbacks.getInterface( Components.interfaces.nsIDOMWindow );

            return callback.top.document ? gBrowser.getBrowserForDocument(callback.top.document).parentNode.id : null;

        } catch( e ) {

            try {

                /// if it failed somehow, try the second method
                notificationCallbacks = aChannel.loadGroup.notificationCallbacks;
                callback = notificationCallbacks.getInterface( Components.interfaces.nsIDOMWindow );

                return callback.top.document ? gBrowser.getBrowserForDocument(callback.top.document).parentNode.id : null;

            } catch( e2 ) {

                dump( e2 + "\n" );
                return null;

            }

        }

        return null;
    },


    /**
     * Returns the feed ID from database.
     */
    getFeedIdForItem: function( item ) {

        try {

            if( item.origin.feed_id != null )
                return item.origin.feed_id;

            this.getDbConn();

            /// make sure, entry exist
            var query = "INSERT OR IGNORE INTO Feeds VALUES ('" + item.origin.streamId + "')";
            this.dbConn.executeSimpleSQL( query );


            /// get feed id
            query = "SELECT rowid FROM Feeds WHERE feed = '" + item.origin.streamId + "'";
            var statement = this.dbConn.createStatement( query );
            statement.executeStep();
            item.origin.feed_id = statement.row.rowid;
            statement.reset();

            return item.origin.feed_id;

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        } finally {
            if( statement )
                statement.reset();
        }
        
    },


    /**
     * Returns the top.document for a given HTTP request.
     */
    getDocumentFromHttpRequest: function( aChannel ) {

    var notificationCallbacks = null;
    var callback = null;

        try {

            /// try the standard method
            notificationCallbacks = aChannel.notificationCallbacks ? aChannel.notificationCallbacks : aChannel.loadGroup.notificationCallbacks;
            callback = notificationCallbacks.getInterface( Components.interfaces.nsIDOMWindow );

            return callback.top.document;

        } catch( e ) {

            try {

                /// if it failed somehow, try the second method
                notificationCallbacks = aChannel.loadGroup.notificationCallbacks;
                callback = notificationCallbacks.getInterface( Components.interfaces.nsIDOMWindow );

                return callback.top.document;

            } catch( e2 ) {

                dump( e2 + "\n" );
                return null;

            }

        }

        return null;
    },


    /// Helper function for XPCOM instanciation
    CCIN: function( cName, ifaceName ) {
            return Components.classes[cName].createInstance( Components.interfaces[ifaceName] );
    },
    
	
    /**
     * returns a connection to the sqlite database
     */
    getDbConn: function() {

        try {

            /// get database file
            if( this.dbFile == null ) {
                this.dbFile = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("ProfD", Components.interfaces.nsIFile);
                this.dbFile.append( "tastygooglereader.sqlite" );
            }

            /// wait until (other) db access is finished
            do {
                var thread = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager).currentThread;
                thread.processNextEvent(true);
            } while( this.db_lock )

            /// get connection to database
            if( this.dbConn == null ) {
                this.db_lock = true;

                /// the connection itself
                var storageService = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService);
                this.dbConn = storageService.openDatabase( this.dbFile );

                /// check version of database
                var query = "PRAGMA user_version";
                var statement = this.dbConn.createStatement( query );
                statement.executeStep();
                var user_version = statement.row.user_version;
                statement.reset();

                /// update database
                if( user_version < 2 ) {
                    dump( "TastyGoogleReader: Update requires a new database. The old one will be dropped. Sorry!" );
                    query = "DROP TABLE IF EXISTS Feeds";
                    this.dbConn.executeSimpleSQL( query );
                    query = "CREATE TABLE 'Feeds' ( 'feed' CHAR PRIMARY KEY  NOT NULL )";
                    this.dbConn.executeSimpleSQL( query );
                    query = "DROP TABLE IF EXISTS Words";
                    this.dbConn.executeSimpleSQL( query );
                    query = "CREATE TABLE 'Words' ( 'feed_id' INTEGER, 'word' CHAR NOT NULL, 'spam' INTEGER NOT NULL DEFAULT 0, 'tofu' INTEGER NOT NULL DEFAULT 0, PRIMARY KEY ( feed_id, word ) )";
                    this.dbConn.executeSimpleSQL( query );
                    query = "PRAGMA user_version = 2";
                    this.dbConn.executeSimpleSQL( query );
                }

                /// create tables if it doesn't exist yet
                query = "CREATE TABLE IF NOT EXISTS 'Feeds' ( 'feed' CHAR PRIMARY KEY  NOT NULL )";
                this.dbConn.executeSimpleSQL( query );
                query = "CREATE TABLE IF NOT EXISTS 'Words' ( 'feed_id' INTEGER, 'word' CHAR NOT NULL, 'spam' INTEGER NOT NULL DEFAULT 0, 'tofu' INTEGER NOT NULL DEFAULT 0, PRIMARY KEY ( feed_id, word ) )";
                this.dbConn.executeSimpleSQL( query );
                query = "PRAGMA user_version = 2";
                this.dbConn.executeSimpleSQL( query );
                
                this.db_lock = false;
            }

            return this.dbConn;

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        } finally {
            this.db_lock = false;
            if( statement )
                statement.reset();
        }
        
    },


    /**
     * marks a given item as read in the response list and updates the
     * keywords in DB accordingly
     */
    markItemAsRead: function( tabId, itemId ) {

        try {

            this.getDbConn();

            /// for every response in list ...
            for( var r = 0; r < this.responseList.length; r++ ) {

                var response = this.responseList[r];

                /// is this the desired tab?
                if( response.tabId == tabId ) {

                    /// for every item in response list ...
                    for( var i = 0; i < response.items.length; i++ ) {

                        var item = response.items[i];

                        /// hoorray!
                        if( item.id == itemId && item.read != true ) {

                            /// mark as read
                            this.increaseGoodCounter( item );
                            item.read = true;
                            break;	/// okay, finished with that item!
                        }

                    } /// for every item

                    break;	/// there should be only this tab

                } /// if tab id

            } /// for every response

            return;

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }

    },

	
    /**
     * marks a given item as unread in the response list and updates the
     * keywords in DB accordingly
     */
    markItemAsUnread: function( tabId, itemId ) {

        try {

            this.getDbConn();

            /// for every response in list ...
            for( var r = 0; r < this.responseList.length; r++ ) {

                var response = this.responseList[r];

                /// is this the desired tab?
                if( response.tabId == tabId ) {

                    /// for every item in response list ...
                    for( var i = 0; i < response.items.length; i++ ) {

                        var item = response.items[i];

                        /// hoorray!
                        if( item.id == itemId && item.read == true ) {

                            /// mark as read
                            this.decreaseGoodCounter( item );
                            item.read = false;
                            break;	/// okay, finished with that item!
                        }

                    } /// for every item

                    break;	/// there should be only this tab

                } /// if tab id

            } /// for every response

            return;

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }

    },

	
    /**
     * marks all items as read and increases the bad counter in th DB
     * for all unread items
     */
    markAllAsRead: function( tabId ) {

        try {

            this.getDbConn();

            /// for every response in list ...
            for( var r = 0; r < this.responseList.length; r++ ) {

                var response = this.responseList[r];

                /// is this the desired tab?
                if( response.tabId == tabId ) {

                    /// for every item in response list ...
                    for( var i = 0; i < response.items.length; i++ ) {

                        var item = response.items[i];

                        /// only the unread items are uninteresting
                        if( item.read != true ) {
                            /// mark as read
                            this.increaseBadCounter( item );
                            item.read = true;
                        }

                    } /// for every item

                    /// remove tab
                    this.removeResponse( tabId );
                    break;	/// there should be only this tab

                } /// if tab id

            } /// for every response

            return;

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }

    },

	
    /**
     * increases the good counter for all words in the given array.
     */
    increaseGoodCounter: function( item ) {

        try {

            // extract keywords from item
            if( item.keywords == null )
                item.keywords = this.extractWordsFromItem( item );

            dump( "* increase: " + item.keywords + "\n" );

            this.getDbConn();
            var feed_id = this.getFeedIdForItem( item );

            /// make sure, every keyword is present in db with default values
            var query = "INSERT OR IGNORE INTO Words (feed_id,word) VALUES(" + feed_id + ",'"
                      + item.keywords.join( "'); INSERT OR IGNORE INTO Words (feed_id,word) VALUES(" + feed_id + ",'" )
                      + "')";
            this.dbConn.executeSimpleSQL( query );

            /// increase the counter
            query = "UPDATE Words SET tofu = tofu + 1 WHERE feed_id = " + feed_id + " AND ( word = '"
                      + item.keywords.join( "' OR word = '" ) + "' )";
            this.dbConn.executeSimpleSQL( query );

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }

    },
	
    /**
     * decreases the good counter for all given words
     */
    decreaseGoodCounter: function( item ) {

        try {

            // extract keywords from item
            if( item.keywords == null )
                item.keywords = this.extractWordsFromItem( item );

            dump( "* decrease: " + item.keywords + "\n" );

            this.getDbConn();
            var feed_id = this.getFeedIdForItem( item );

            /// update the counters
            var query = "UPDATE Words SET tofu = tofu - 1 WHERE feed_id = " + feed_id + " AND ( word = '"
                      + item.keywords.join( "' OR word = '" ) + "' )";
            this.dbConn.executeSimpleSQL( query );

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }

    },

	
    /**
     * increases the bad counter for all words in the given array.
     */
    increaseBadCounter: function( item ) {

        try {

            // extract keywords from item
            if( item.keywords == null )
                item.keywords = this.extractWordsFromItem( item );

            dump( "* decrease: " + item.keywords + "\n" );

            this.getDbConn();
            var feed_id = this.getFeedIdForItem( item );

            /// make sure, every keyword is present in db with default values
            var query = "INSERT OR IGNORE INTO Words (feed_id,word) VALUES(" + feed_id + ",'"
                      + item.keywords.join( "'); INSERT OR IGNORE INTO Words (feed_id,word) VALUES(" + feed_id + ",'" )
                      + "')";
            this.dbConn.executeSimpleSQL( query );

            /// increase the counter
            query = "UPDATE Words SET spam = spam + 1 WHERE feed_id = " + feed_id + " AND ( word = '"
                      + item.keywords.join( "' OR word = '" ) + "' )";
            this.dbConn.executeSimpleSQL( query );

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }

    },
	
	
    /**
     * many thanks to Masanao Izumo <iz@onicos.co.jp> !
     */
    utf16to8: function(str) {
        var out, i, len, c;

        out = "";
        len = str.length;
        for(i = 0; i < len; i++) {
            c = str.charCodeAt(i);
            if ((c >= 0x0001) && (c <= 0x007F)) {
                out += str.charAt(i);
            } else if (c > 0x07FF) {
                out += String.fromCharCode(0xE0 | ((c >> 12) & 0x0F));
                out += String.fromCharCode(0x80 | ((c >>  6) & 0x3F));
                out += String.fromCharCode(0x80 | ((c >>  0) & 0x3F));
            } else {
                out += String.fromCharCode(0xC0 | ((c >>  6) & 0x1F));
                out += String.fromCharCode(0x80 | ((c >>  0) & 0x3F));
            }
        }
        return out;
    },


    /**
     * many thanks to Masanao Izumo <iz@onicos.co.jp> !
     */
    utf8to16: function(str) {
        var out, i, len, c;
        var char2, char3;

        out = "";
        len = str.length;
        i = 0;
        while(i < len) {
            c = str.charCodeAt(i++);
            switch(c >> 4)
            {
                case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                    // 0xxxxxxx
                    out += str.charAt(i-1);
                    break;
                case 12: case 13:
                    // 110x xxxx   10xx xxxx
                    char2 = str.charCodeAt(i++);
                    out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                    break;
                case 14:
                    // 1110 xxxx  10xx xxxx  10xx xxxx
                    char2 = str.charCodeAt(i++);
                    char3 = str.charCodeAt(i++);
                    out += String.fromCharCode(((c & 0x0F) << 12) |
                                               ((char2 & 0x3F) << 6) |
                                               ((char3 & 0x3F) << 0));
                    break;
            }
        }

        return out;
    },
	
	
    itemSort: function( a, b ) {
        return b.rating - a.rating;
    },


    sortRows: function( a, b ) {
        return b.relevance - a.relevance;
    },


    extractWordsFromHtml: function( s ) {

        try {

            var content = "";
            var frame = document.getElementById( "tasty-iframe" );

            if ( !frame ) {

                // create iframe
                frame = document.createElement("iframe"); // iframe or browser
                frame.setAttribute("id", "tasty-iframe");
                frame.setAttribute("name", "tasty-iframe");
                frame.setAttribute("type", "content");
                frame.style.setProperty('min-height', "0px", 'important');
                frame.style.setProperty('height', "0px", 'important');
                document.getElementById("main-window").appendChild(frame);

                // set restrictions as needed
                frame.webNavigation.allowAuth = false;
                frame.webNavigation.allowImages = false;
                frame.webNavigation.allowJavascript = false;
                frame.webNavigation.allowMetaRedirects = true;
                frame.webNavigation.allowPlugins = false;
                frame.webNavigation.allowSubframes = false;
            }

            // load a page
            frame.webNavigation.loadURI( 'data:text/html;charset=UTF-8,' + s, Components.interfaces.nsIWebNavigation, null, null, null );

            /// wait until page is loaded
            var thread = null;
            do {
                thread = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager).currentThread;
                thread.processNextEvent(true);
            } while( frame.contentDocument.location.href == "about:blank" )

            ///
            content = frame.contentDocument.body.textContent;
            this.frame = frame;

            /// unload page
            frame.contentDocument.location.href = "about:blank";

            /// wait until page is unloaded
            do {
                thread = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager).currentThread;
                thread.processNextEvent(true);
            } while( frame.contentDocument.location.href != "about:blank" )
            
            return this.extractWordsFromString( this.utf8to16( content ) );

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
        }
        
    }

};

window.addEventListener( "load", TastyGoogleReader.onLoad, false );
