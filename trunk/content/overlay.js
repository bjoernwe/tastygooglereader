/**
 * Handles the http-on-modify and http-on-examine-response events.
 */
var TastyRequestObserver =
{

	observe: function( subject, topic, data ) {
	  
		subject.QueryInterface( Components.interfaces.nsIHttpChannel );
		var url = subject.URI.spec;
    
		if( topic == "http-on-modify-request" ) {
	
			/// is this request relevant for us?
			if( url.search( "google.com/reader/api/" ) > -1 ) {
		
				/// replace the number of requested items and update url
				//subject.URI.spec = url.replace( /([&?])n=\d+/g, "$1n=100" );
				//url = subject.URI.spec;
				
				/// tell server to send plain text responses. we can not work
				/// properly with a ziped response.
				subject.setRequestHeader( "Accept-Encoding", "text/plain", false );
				
				dump( "http-on-modify-request: " + url + "\n" );
		
			}
	  
		} else if( topic == "http-on-examine-response" ) {
		
		    /// is this request relevant for us?
		    if( url.search( "google.com/reader/api/" ) > -1 ) {
		  
				//dump( "http-on-examine-response: " + url + "\n" );

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

    onDataAvailable: function( request, context, inputStream, offset, count )
    {
    
		try {
		  
			var binaryInputStream = TastyGoogleReader.CCIN( "@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream" );
			var storageStream = TastyGoogleReader.CCIN( "@mozilla.org/storagestream;1", "nsIStorageStream" );
			var binaryOutputStream = TastyGoogleReader.CCIN( "@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream" );
			   
			binaryInputStream.setInputStream( inputStream );

			// Copy received data as they come.
			var data = binaryInputStream.readBytes(count);
			this.receivedData.push(data);
			var s = this.receivedData.join("");

			/// reached the end of the JSON encoded news?
			if( s.substr( s.length-4, 4 ) == "}}]}" ) {
			
				var response = JSON.parse( s );
				response = TastyGoogleReader.sortResponse( response );          
				s = JSON.stringify( response );
				dump( this.tabId + "\n" );
			
				storageStream.init( 8192, s.length, null );
				binaryOutputStream.setOutputStream( storageStream.getOutputStream(0) );
				binaryOutputStream.writeBytes( s, s.length );
				this.originalListener.onDataAvailable( request, context, storageStream.newInputStream(0), 0, s.length );
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
  
	tabList: 	null,
	itemList: 	null,

	// initialization code
	onLoad: function() {
		TastyRequestObserver.register();
		gBrowser.tabContainer.addEventListener( "TabClose", TastyGoogleReader.onTabRemoved, false );
	},
  
	onTabRemoved: function( event ) {
		var browser = event.target.linkedBrowser;
		dump( "id: " + event.target.linkedBrowser.parentNode.id + "\n" );
	},
  
	/**
	 * sort the feed items. that's the important part! :-)
     */
	sortResponse: function( response ) {

		// get database file
		var file = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("ProfD", Components.interfaces.nsIFile);
		file.append( "my_db_file_name.sqlite" );

		// get connection to database
		var storageService = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService);
		var dbConn = storageService.openDatabase(file);

		// items...
		for( var i = 0; i < response.items.length; i++ ) {

			var wordList = TastyGoogleReader.extractWordsFromItem( response.items[i] );
			dump( wordList.length + ": " + wordList + "\n" );
		  
			for( var j = 0; j < wordList.length; j++ ) {
				var w = wordList[j];
				dbConn.executeSimpleSQL( "INSERT OR REPLACE INTO Words VALUES ( '" + w + "', ( SELECT good+1 FROM Words WHERE word = '" + w + "' ), ( SELECT bad FROM Words WHERE word = '" + w + "' ) )" );
			}
		  
		}

		return response;
	},

    /**
     * extracts words from a news item
     */
    extractWordsFromItem: function( item ) {

		var words = [];
		var newWords = TastyGoogleReader.extractWordsFromString( item.categories.join( " " ) );

		for( var i = 0; i < newWords.length; i++ )
			words.push( newWords[i] );

		var newWords = TastyGoogleReader.extractWordsFromString( item.title );

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
	getTabIDfromDOM : function( aChannel, aSubject ) {
	
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
	
	},

	/// Helper function for XPCOM instanciation
	CCIN: function( cName, ifaceName ) {
		return Components.classes[cName].createInstance( Components.interfaces[ifaceName] );
	}

};

window.addEventListener( "load", TastyGoogleReader.onLoad, false );
