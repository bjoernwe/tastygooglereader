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


function TastyTracingListener( topDoc, url, parameters ) {
    this.topDoc         = topDoc;
    this.url            = url;
    this.parameters     = parameters;
    this.tabId          = gBrowser.getBrowserForDocument(topDoc).parentNode.id;
    this.receivedData   = [];
}

/**
 * A StreamListener that collects the fragmented responses from the 
 * server and sorts the news items before handing on the response.
 */
TastyTracingListener.prototype =
{
    topDoc:             null,
    url:                null,
    parameters:         null,
    tabId:              null,
    originalListener:   null,
    receivedData:       null,	/// array for incoming data
	
    regexpParamC:       /&c=([^&]*)/i,	/// RegExp to find/extract parameter c ("load/reload")
    regexpParamOt:      /&ot=([^&]*)/i,	/// RegExp to find/extract parameter ot ("new/all")
    regexpParamR:       /&r=([^&]*)/i,	/// RegExp to find/extract parameter r (ordering)

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

                /// get parameters of the feed request
                var paramC	= this.parameters.match( this.regexpParamC );
                    paramC 	= paramC ? paramC[1] : null;
                var paramOt	= this.parameters.match( this.regexpParamOt );
                    paramOt	= paramOt ? paramOt[1] : null;
                var paramR	= this.parameters.match( this.regexpParamR );
                    paramR	= paramR ? paramR[1] : null;

                /// sort response and re-code it
                var response = JSON.parse( s );
                TastyGoogleReader.processResponse( response, this.topDoc );
                if( paramR == "m" )
                    response.items.sort( TastyGoogleReader.itemSort );
                s = JSON.stringify( response );

                /// hand on the sorted response
                storageStream.init( 8192, s.length, null );
                binaryOutputStream.setOutputStream( storageStream.getOutputStream(0) );
                binaryOutputStream.writeBytes( s, s.length );
                this.originalListener.onDataAvailable( request, context, storageStream.newInputStream(0), 0, s.length );

                /// remember response with it's tabId
                response.tabId = this.tabId;
                if( paramC ) {
                    /// the reader seems to reload items for a stream.
                    TastyGoogleReader.mergeResponse( response );
                } else {
                    TastyGoogleReader.rememberResponse( response );
                }
            }

        } catch(e) {
            dump( e + ":\n" + e.stack + "\n" );
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
