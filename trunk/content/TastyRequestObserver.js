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
	googleReaderParametersR:	/&r=([^&]*)/i,	/// RegExp to find/extract parameter r (ordering)

	observe: function( subject, topic, data ) {

		try {
	  
			subject.QueryInterface( Components.interfaces.nsIHttpChannel );
			var url = subject.URI.spec;
		
			if( topic == "http-on-modify-request" ) {
				
				/// is this request relevant for us?
				if( url.search( this.googleReaderApi ) > -1 ) {
					
					dump( "http-on-modify-request: " + url + "\n" );
					
					/// find tab ID for this request
					var tabId = TastyGoogleReader.getTabIDfromDOM( subject );
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
						var ordering = parameters.match( this.googleReaderParametersR );
						if( ordering[1] == m )
							subject.URI.spec = subject.URI.spec.replace( /([&?])n=\d+/g, "$1n=100" );
						
						/// tell server to send plain text responses. we can not work
						/// properly with a ziped response.
						subject.setRequestHeader( "Accept-Encoding", "text/plain", false );
						
						dump( "feed requested: " + url + "\n" );
				
					} else if( url.search( this.googleReaderApiMarkAllRead ) > -1 ) {
						
						dump( "mark all as read\n" );
						TastyGoogleReader.markAllAsRead( tabId );
											
					} else if( url.search( this.googleReaderApiEditTag ) > -1 ) {
						
						dump( "edit tag\n" );
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
								TastyGoogleReader.markItemAsUnread( tabId, itemId );
								break;
							default:
								break;
						}
						
					} /// end api call
					
				} /// end relevant
		  
			} else if( topic == "http-on-examine-response" ) {
			
				/// is this request relevant for us?
				if( url.search( this.googleReaderApiStream ) > -1 ) {
			  
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
							subject.QueryInterface( Components.interfaces.nsIHttpChannel );
							break;
						default:
							dump( "TastyRequestObserver: unexpected requestMethod\n" );
					}
					
					dump( "feed response: " + url + " + " + parameters + "\n" );

					/// find top document for this request
					var topDoc = TastyGoogleReader.getDocumentFromHttpRequest( subject );

					/// Register the StremListener. It will sort the news items...
					var newListener = new TastyTracingListener( topDoc, url, parameters );
					subject.QueryInterface( Components.interfaces.nsITraceableChannel );
					newListener.originalListener = subject.setNewListener( newListener );

				}
			  
			}
    
		} catch(e) {
			dump( e + "\n" );
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
