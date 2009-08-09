/**
 * Handles the http-on-modify and http-on-examine-response events.
 */
var TastyRequestObserver =
{
	googleReaderApi:			/^https?:\/\/www\.google\.com\/reader\/api\/0\//i,
	googleReaderApiStream: 		/^https?:\/\/www\.google\.com\/reader\/api\/0\/stream\/contents\//i,
	googleReaderApiEditTag:     /^https?:\/\/www\.google\.com\/reader\/api\/0\/edit-tag/i,
	googleReaderApiMarkAllRead: /^https?:\/\/www\.google\.com\/reader\/api\/0\/mark-all-as-read/i,
	googleReaderApiParameters:	/^(https?:\/\/www\.google\.com\/reader\/api\/0\/[^?]*\?)(.*)/i,
	googleReaderParametersAI:   /a=[^&]+%2F([^&]+).*i=([^&]*)/i,

	observe: function( subject, topic, data ) {
	  
		subject.QueryInterface( Components.interfaces.nsIHttpChannel );
		var url = subject.URI.spec;
    
		if( topic == "http-on-modify-request" ) {
			
			/// is this request relevant for us?
			if( url.search( this.googleReaderApi ) > -1 ) {
				
				dump( "http-on-modify-request: " + url + "\n" );
				
				/// find tab ID for this request
				var tabId = TastyGoogleReader.getTabIDfromDOM( subject, subject );
				var parameters = "";
				
				/// we split the request in it's url and it's parameters.
				/// this way, we are independent from the requestMethod
				/// in the following
				switch( subject.requestMethod ) {
					case "GET":
						var urlparam = url.match( this.googleReaderApiParameters );
						url          = urlparam[1];
						parameters   = urlparam[2];
						break;
					case "POST":
						subject.QueryInterface( Components.interfaces.nsIUploadChannel );
						var urlparam = url.match( this.googleReaderApiParameters );
						url          = urlparam[1];
						parameters   = urlparam[2] + "&" + subject.uploadStream.data;
						break;
					default:
						dump( "TastyRequestObserver: unexpected requestMethod\n" );
				}
				
				/// is this a request for streams?
				if( url.search( this.googleReaderApiStream ) > -1 ) {
			
					/// replace the number of requested items and update url
					//subject.URI.spec = url.replace( /([&?])n=\d+/g, "$1n=100" );
					//url = subject.URI.spec;
					
					/// tell server to send plain text responses. we can not work
					/// properly with a ziped response.
					subject.setRequestHeader( "Accept-Encoding", "text/plain", false );
					
					dump( "feed requested: " + url + "\n" );
			
				} else if( url.search( this.googleReaderApiMarkAllRead ) > -1 ) {
					
					dump( "mark all as read\n" );
										
				} else if( url.search( this.googleReaderApiEditTag ) > -1 ) {
					
					dump( "edit tag\n" );
					TastyGoogleReader.stream = subject;
					dump( url + "\n" );
					dump( parameters + "\n" );
					
					var p      = parameters.match( this.googleReaderParametersAI );
					var action = p[1];
					var itemId = decodeURIComponent( p[2] );
					
					dump( action + ": " + itemId + "\n" );

					switch( action ) {
						case "read":
							TastyGoogleReader.markItemAsRead( tabId, itemId );
							break;
						case "kept-unread":
							break;
						default:
							break;
					}
					
				} /// end api call
				
			} /// end relevant
	  
		} else if( topic == "http-on-examine-response" ) {
		
		    /// is this request relevant for us?
		    if( url.search( this.googleReaderApiStream ) > -1 ) {
		  
				dump( "feed response: " + url + "\n" );

				/// find tab ID for this request
				var tabId = TastyGoogleReader.getTabIDfromDOM( subject, subject );

				/// Register the StremListener. It will sort the news items...
				var newListener = new TastyTracingListener( tabId );
				subject.QueryInterface( Components.interfaces.nsITraceableChannel );
				newListener.originalListener = subject.setNewListener( newListener );

			}
		  
		}
    
	},

	get observerService() {
		return Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
	},

	register: function() {
		this.observerService.addObserver( this, "http-on-modify-request",   false );
		this.observerService.addObserver( this, "http-on-examine-response", false );
	},

	unregister: function() {
		this.observerService.removeObserver( this, "http-on-modify-request" );
		this.observerService.removeObserver( this, "http-on-examine-response" );
	},
  
	QueryInterface: function( aIID ) {
		if( aIID.equals( Components.interfaces.nsIObserver ) ||
			aIID.equals( Components.interfaces.nsISupports ) ) {
			return this;
		}
      
		throw Components.results.NS_NOINTERFACE;
	}
  
};

function TastyTracingListener( tabId ) {
  this.tabId = tabId;
  this.receivedData = [];
}

/**
 * A StreamListener that collects the fragmented responses from the 
 * server and sorts the news items before handing on the response.
 */
TastyTracingListener.prototype =
{
	tabId: 				null,
    originalListener: 	null,
    receivedData: 		null,	/// array for incoming data

    onDataAvailable: function( request, context, inputStream, offset, count ) {
    
		try {
		  
			var binaryInputStream = TastyGoogleReader.CCIN( "@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream" );
			var storageStream = TastyGoogleReader.CCIN( "@mozilla.org/storagestream;1", "nsIStorageStream" );
			var binaryOutputStream = TastyGoogleReader.CCIN( "@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream" );
			   
			binaryInputStream.setInputStream( inputStream );

			/// append received data to data array
			var data = binaryInputStream.readBytes(count);
			this.receivedData.push(data);
			var s = this.receivedData.join("");
			var s_end = s.substr( s.length-4, 4 );

			/// reached the end of the JSON encoded news?
			if( s_end == "}}]}" || s_end == ":[]}" ) {
			
				/// sort response and re-code it
				var response = JSON.parse( s );
				TastyGoogleReader.sortResponse( response );
				s = JSON.stringify( response );
			
				/// hand on the sorted response
				storageStream.init( 8192, s.length, null );
				binaryOutputStream.setOutputStream( storageStream.getOutputStream(0) );
				binaryOutputStream.writeBytes( s, s.length );
				this.originalListener.onDataAvailable( request, context, storageStream.newInputStream(0), 0, s.length );
				
				/// remember response with it's tabId
				response.tabId = this.tabId;
				TastyGoogleReader.rememberResponse( response );
			}

		} catch(e) {
			dump( e + "\n" );
		}
      
    },

    onStartRequest: function(request, context) {
        this.originalListener.onStartRequest(request, context);
    },

    onStopRequest: function(request, context, statusCode) {
        /// get entire response
        //var responseSource = this.receivedData.join("");
        this.originalListener.onStopRequest(request, context, statusCode);
    },

    QueryInterface: function (aIID) {
        if( aIID.equals( Ci.nsIStreamListener ) ||
            aIID.equals( Ci.nsISupports ) ) {
            return this;
        }
        throw Components.results.NS_NOINTERFACE;
    }
}

var TastyGoogleReader =
{
  
	responseList: 	[],
	dbFile:			null,
	dbConn:			null,

	// initialization code
	onLoad: function() {
		dump( "TastyGoogleReader " );
		TastyRequestObserver.register();
		gBrowser.tabContainer.addEventListener( "TabClose", TastyGoogleReader.onTabRemoved, false );
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
		
		return;
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
	 * event handler vor removed tabs
	 */
	onTabRemoved: function( event ) {
		var tabId = event.target.linkedBrowser.parentNode.id;
		this.removeResponse( tabId );
		return;
	},
  
	/**
	 * sort the feed items. that's the important part! :-)
     */
	sortResponse: function( response ) {

		/// items...
		for( var i = 0; i < response.items.length; i++ ) {
			
			var item = response.items[i];
			var wordList = TastyGoogleReader.extractWordsFromItem( item );
			item.keywords = wordList;	/// save the results for later
			
			dump( wordList.length + ": " + wordList + "\n" );
		  
			/// test
			response.items[i].title = response.items[i].title.toUpperCase();
		}

		return response;
	},

    /**
     * extracts words from a news item
     */
    extractWordsFromItem: function( item ) {
		
		/// did we already do the work of extracting the keywords?
		if( item.keywords )
			return item.keywords;

		var words = [];
		var newWords = [];
		
		//newWords = TastyGoogleReader.extractWordsFromString( item.categories.join( " " ) );
		//for( var i = 0; i < newWords.length; i++ )
		//	words.push( newWords[i] );

		newWords = TastyGoogleReader.extractWordsFromString( item.title );
		for( var i = 0; i < newWords.length; i++ )
			words.push( newWords[i] );

		return words;
	},

    /**
     * Here we decide what counts as a word what doesn't.
     */
	extractWordsFromString: function( s ) {
    
		var word;
		var words = [];
		var rexp = /([A-Z][0-9A-Z]+[0-9A-Z])/gi;

		while( word = rexp.exec( s ) )
			words.push( word[1].toLowerCase() );

		return words;
	},

    /**
     * Returns the Tab-ID for a given HTTP request.
     */
	getTabIDfromDOM: function( aChannel, aSubject ) {
	
		try {
			
		    /// try the standard method
		    var notificationCallbacks = aChannel.notificationCallbacks ? aChannel.notificationCallbacks : aSubject.loadGroup.notificationCallbacks;
		    var callback = notificationCallbacks.getInterface( Components.interfaces.nsIDOMWindow );
		  
		    return callback.top.document ? gBrowser.getBrowserForDocument(callback.top.document).parentNode.id : null;
		  
		} catch( e ) {
			
		    try {
			  
				/// if it failed somehow, try the second method
				var notificationCallbacks = aSubject.loadGroup.notificationCallbacks;
				var callback = notificationCallbacks.getInterface( Components.interfaces.nsIDOMWindow );
				
				return callback.top.document ? gBrowser.getBrowserForDocument(callback.top.document).parentNode.id : null;
			
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
		
		/// get database file
		if( this.dbFile == null ) {
			this.dbFile = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("ProfD", Components.interfaces.nsIFile);
			this.dbFile.append( "my_db_file_name.sqlite" );
		}
			
		/// get connection to database
		if( this.dbConn == null ) {
			var storageService = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService);
			this.dbConn = storageService.openDatabase( this.dbFile );
		}
		
		return this.dbConn;
	},

	markItemAsRead: function( tabId, itemId ) {
		
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
						
						for( var w = 0; w < item.keywords.length; w++ ) {
							var word = item.keywords[w];
							this.dbConn.executeSimpleSQL( "INSERT OR REPLACE INTO Words VALUES ( '" + word + "', ( SELECT good+1 FROM Words WHERE word = '" + word + "' ), ( SELECT bad FROM Words WHERE word = '" + word + "' ) )" );
						}
						
						item.read = true;
						break;	/// okay, finished with that item!
					}
					
				} /// for every item
				
				break;	/// there should be only this tab
				
			} /// if tab id
			
		} /// for every response
		
		return;
	}
	
};

window.addEventListener( "load", TastyGoogleReader.onLoad, false );
