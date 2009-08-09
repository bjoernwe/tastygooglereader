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
