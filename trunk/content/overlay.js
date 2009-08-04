var httpRequestObserver =
{

  observe: function( subject, topic, data )
  {
    subject.QueryInterface( Components.interfaces.nsIHttpChannel );
    var url = subject.URI.spec;
    
    if( topic == "http-on-modify-request" ) {
      if( url.search( "google.com/reader/api/" ) > -1 ) {
        //subject.URI.spec = url.replace( /([&?])n=\d+/g, "$1n=100" );
        //url = subject.URI.spec;
	    dump( "http-on-modify-request: " + url + "\n" );
	    subject.setRequestHeader("Accept-Encoding", "text/plain", false);
	  }
    }
    
    if (topic == "http-on-examine-response") {
    
      if( url.search( "google.com/reader/api/" ) > -1 ) {
      
        //dump( "http-on-examine-response: " + url + "\n" );
        
        var tabId = tastygooglereader.getTabIDfromDOM( subject, subject );
        dump( "tabId: " + tabId + " (" + url + ")\n" );

        var newListener = new TracingListener();
        subject.QueryInterface( Components.interfaces.nsITraceableChannel );
        newListener.originalListener = subject.setNewListener( newListener );

      }
      
    }
    
  },

  get observerService() {
    return Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
  },

  register: function()
  {
    this.observerService.addObserver(this, "http-on-modify-request", false);
    this.observerService.addObserver(this, "http-on-examine-response", false);
  },

  unregister: function()
  {
    this.observerService.removeObserver(this, "http-on-modify-request");
    this.observerService.removeObserver(this, "http-on-examine-response");
  },
  
  QueryInterface: function (aIID)
    {
      if ( aIID.equals( Components.interfaces.nsIObserver ) ||
           aIID.equals( Components.interfaces.nsISupports ) )
      {
        return this;
      }
      
      throw Components.results.NS_NOINTERFACE;
    }
  
};

// Helper function for XPCOM instanciation (from Firebug)
function CCIN(cName, ifaceName) {
    return Cc[cName].createInstance(Ci[ifaceName]);
}

function TracingListener() {
  this.receivedData = [];
}

TracingListener.prototype =
{
    originalListener: null,
    receivedData: null,   // array for incoming data.

    onDataAvailable: function(request, context, inputStream, offset, count)
    {
    
      try {
      
        var binaryInputStream = CCIN( "@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream" );
        var storageStream = CCIN( "@mozilla.org/storagestream;1", "nsIStorageStream" );
        var binaryOutputStream = CCIN( "@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream" );
           
        binaryInputStream.setInputStream(inputStream);

        // Copy received data as they come.
        var data = binaryInputStream.readBytes(count);
        this.receivedData.push(data);
        var s = this.receivedData.join("");

        if( s.substr( s.length-4, 4 ) == "}}]}" ) {
        
          var response = JSON.parse( s );
          response = tastygooglereader.sortResponse( response );          
          s = JSON.stringify( response );
        
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

    onStopRequest: function(request, context, statusCode)
    {
        // Get entire response
        //var responseSource = this.receivedData.join("");
        this.originalListener.onStopRequest(request, context, statusCode);
    },

    QueryInterface: function (aIID) {
        if (aIID.equals(Ci.nsIStreamListener) ||
            aIID.equals(Ci.nsISupports)) {
            return this;
        }
        throw Components.results.NS_NOINTERFACE;
    }
}

var tastygooglereader = {

  onLoad: function() {
    // initialization code
    //this.initialized = true;
    //this.strings = document.getElementById("tastygooglereader-strings");
    httpRequestObserver.register();
    gBrowser.tabContainer.addEventListener("TabClose", tastygooglereader.onTabRemoved, false);
  },
  
  onMenuItemCommand: function(e) {
    var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
    promptService.alert(window, this.strings.getString("helloMessageTitle"),
                                this.strings.getString("helloMessage"));
  },

  onTabRemoved: function( event ) {
      var browser = event.target.linkedBrowser;
      dump( "id: " + event.target.linkedBrowser.parentNode.id + "\n" );
  },
  
  /*
   * sort the feed items. that is the important part! :-)
   */
  sortResponse: function( response ) {

    // get database file
    var file = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("ProfD", Components.interfaces.nsIFile);
    file.append("my_db_file_name.sqlite");

    // get connection to database
    var storageService = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService);
    var dbConn = storageService.openDatabase(file);

    // items...
    for( var i = 0; i < response.items.length; i++ ) {

      var wordList = tastygooglereader.extractWordsFromItem( response.items[i] );
      //dump( wordList.length + ": " + wordList + "\n" );
      
      for( var j = 0; j < wordList.length; j++ ) {
          var w = wordList[j];
          dbConn.executeSimpleSQL( "INSERT OR REPLACE INTO Words VALUES ( '" + w + "', ( SELECT good+1 FROM Words WHERE word = '" + w + "' ), ( SELECT bad FROM Words WHERE word = '" + w + "' ) )" );
      }
          

    }

    return response;
  },

  /*
   * extracts words from a news item
   */
  extractWordsFromItem: function( item ) {

    var words = [];
    //words.push( tastygooglereader.extractWordsFromString( item.categories.join( " " ) ) );
    var newWords = tastygooglereader.extractWordsFromString( item.title );

    for( var i = 0; i < newWords.length; i++ )
      words.push( newWords[i] );

    return words;
  },

  /*
   * extract the relevant words from input string and returns an array
   */
  extractWordsFromString: function( string ) {
    
    var words = string.match( /[A-Z][0-9A-Z]*[0-9A-Z]/gi );

    for( var i = 0; i < words.length; i++ )
        words[i] = words[i].toLowerCase();

    return words;
  },

  /*
   * Returns the Tab-ID for a given HTTP request.
   */
  getTabIDfromDOM : function( aChannel, aSubject ) {
    try {
      // try the standard method
      var notificationCallbacks = aChannel.notificationCallbacks ? aChannel.notificationCallbacks : aSubject.loadGroup.notificationCallbacks;
      var callback = notificationCallbacks.getInterface( Components.interfaces.nsIDOMWindow );
      return callback.top.document ? gBrowser.getBrowserForDocument(callback.top.document).parentNode.id : null;
    } catch(e) {
      try {
        // if it failed somehow, try the second method
        var notificationCallbacks = aSubject.loadGroup.notificationCallbacks;
        var callback = notificationCallbacks.getInterface( Components.interfaces.nsIDOMWindow );
        return callback.top.document ? gBrowser.getBrowserForDocument(callback.top.document).parentNode.id : null;
      } catch(e2) {
        dump( e2 + "\n" );
        return null;
      }
    }
  },

};

// is this really neccessary?
//function NSGetModule( compMgr, fileSpec ) {
//    return tastygooglereader;
//}

window.addEventListener( "load", tastygooglereader.onLoad, false );

