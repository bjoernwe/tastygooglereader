function TastyTracingListener( topDoc ) {
	this.topDoc = topDoc;
	this.tabId = gBrowser.getBrowserForDocument(topDoc).parentNode.id;
	this.receivedData = [];
}

/**
 * A StreamListener that collects the fragmented responses from the 
 * server and sorts the news items before handing on the response.
 */
TastyTracingListener.prototype =
{
	topDoc:				null,
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
				
				/// set status
				this.topDoc.getElementById("loading-area-text").textContent = "Thinking...";
			
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
