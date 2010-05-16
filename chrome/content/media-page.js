
// Shorthand
if (typeof(Cc) == "undefined")
  var Cc = Components.classes;
if (typeof(Ci) == "undefined")
  var Ci = Components.interfaces;
if (typeof(Cu) == "undefined")
  var Cu = Components.utils;
if (typeof(Cr) == "undefined")
  var Cr = Components.results;
  
Cu.import("resource://app/jsmodules/sbProperties.jsm");


/**
 * Media Page Controller
 *
 * In order to display the contents of a library or list, pages
 * must provide a "window.mediaPage" object implementing
 * the Songbird sbIMediaPage interface. This interface allows
 * the rest of Songbird to talk to the page without knowledge 
 * of what the page looks like.
 *
 * In this particular page most functionality is simply 
 * delegated to the sb-playlist widget.
 */
window.mediaPage = {
    
    // The sbIMediaListView that this page is to display
  _mediaListView: null,
  
  analysis: null,
  
  sketch: null,
  
  /** 
   * Gets the sbIMediaListView that this page is displaying
   */
  get mediaListView()  {
    return this._mediaListView;
  },
  
  JSON: Cc['@mozilla.org/dom/json;1'].createInstance(Ci.nsIJSON),
  
  handleSearchResponse: function(response) {
    // get a JS object 
    var responseObj = this.JSON.decode(response);
    var analysis_url = responseObj["response"]["songs"][0]["tracks"][0]["analysis_url"];
    alert(analysis_url);
    
    // pull analysis from given url.
    var self = this;
    this.callAPI(analysis_url, function(response)
    {
        var track = self.JSON.decode(response);
        self.setupProcessing(track);
    });
    
  },
  
  /** 
   * Set the sbIMediaListView that this page is to display.
   * Called in the capturing phase of window load by the Songbird browser.
   * Note that to simplify page creation mediaListView may only be set once.
   */
  set mediaListView(value)
  {
    if (!this._mediaListView)
        this._mediaListView = value;
    else
        throw new Error("mediaListView may only be set once.  Please reload the page");
  },
    
  get_md5: function(file)
  {
      var fiStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
      fiStream.init(file, 0x01, 0666, 0); // fuck yeah
      var ch = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
      ch.init(ch.MD5);
      // this tells updateFromStream to read the entire file
      const PR_UINT32_MAX = 0xffffffff;
      ch.updateFromStream(fiStream, PR_UINT32_MAX);
      // pass false here to get binary data back
      var hash = ch.finish(false);
      // return the two-digit hexadecimal code for a byte
      function toHexString(charCode)
      {
          return ("0" + charCode.toString(16)).slice(-2);
      }
      
      // convert the binary hash data to a hex string.
      var s = [toHexString(hash.charCodeAt(i)) for (i in hash)].join("");
      return s;
  },
  
  callAPI: function(url, callback) 
  {
      dump("api call: " + url + "\n");
      var req = Cc['@mozilla.org/xmlextras/xmlhttprequest;1'].createInstance(Ci.nsIXMLHttpRequest);
      req.open('GET',url,true);
      req.onreadystatechange = function(e) 
      {
          if (req.readyState == 4)
          {
              if (req.status == 200) {
                dump("response: " + req.responseText + "\n");
                callback(req.responseText);
              }
              else {
                Cu.reportError("api xmlhttprequest error");
                dump("xmlhttprequest error\n");
              }              
          }
      };
      req.send(null);
  },
  
  getAnalysis: function(md5, artist, title, contentURL)
  {
      artist = encodeURIComponent(artist);
      title = encodeURIComponent(title);
      
      // Skip md5 for now; it takes time, and we can't do a proper lookup.
      var file = this.getLocalAnalysis(contentURL);
      if (file) {
        dump("analysis results exist locally\n");
        // load the json
        var fiStream = Cc["@mozilla.org/network/file-input-stream;1"]
                         .createInstance(Ci.nsIFileInputStream);
        fiStream.init(file, 0x01, 0, 0);
        var fiStreamScriptable = Cc["@mozilla.org/scriptableinputstream;1"]
                                   .createInstance(Ci.nsIScriptableInputStream);
        fiStreamScriptable.init(fiStream);
        var len = fiStreamScriptable.available();


        var filestring = fiStreamScriptable.read(len);
        dump(filestring);
        fiStreamScriptable.close();
        fiStream.close();

        // convert to JSON
        var track = this.JSON.decode(filestring); 
        this.setupProcessing(track); 
        return;
      }
      
      var url = "http://beta.developer.echonest.com/api/v4/song/search?api_key=HSHR3EZROVIQJYY43&format=json" +
      "&results=1&artist=" + artist + "&title=" + title +
      "&bucket=tracks&bucket=audio_summary&bucket=id:paulify";
      
      var self = this;
      this.callAPI(url, function(response) { self.handleSearchResponse(response);});
  },

  /**
   * Check chrome://songbirdvis/content/data for a local json file. Return the
   * file object if it exists, otherwise return null.
   */
  getLocalAnalysis: function(contentURL) {
      
      dump("checking to see if " + contentURL + " json exists\n");
      var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
      var filehandler = ios.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
      var file = filehandler.getFileFromURLSpec(contentURL + ".json");
      return file;
  },

  /**
   * Setup the Processing script
   */
  setupProcessing: function(track) {
      this.analysis = new TrackInfo(track);
      this.visController = DiagnosticVis.Controller;
      this.visController.setupProcessing(this.sketch);
  },

  /** 
   * Called when the page finishes loading.  
   * By this time window.mediaPage.mediaListView should have 
   * been externally set.
   */
  onLoad: function(e)
  {
    // Make sure we have the javascript modules we're going to use
    if (!window.SBProperties)
      Cu.import("resource://app/jsmodules/sbProperties.jsm");
    if (!window.LibraryUtils)
      Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
    if (!window.kPlaylistCommands)
      Cu.import("resource://app/jsmodules/kPlaylistCommands.jsm");
    
    if (!this._mediaListView) 
    {
        Components.utils.reportError("Media Page did not receive a mediaListView before the onload event!");
        return;
    }
    
    // Set up canvas:
    this.sketch = {};
    this.sketch.canvas = document.getElementById("visualizer_canvas");
    var mybox = document.getElementById("visualizerfm-media-page");
    this.sketch.width = parseInt(mybox.boxObject.width);
    this.sketch.height = parseInt(mybox.boxObject.height);
    
    // Listen to changes in the position dataremote.
    var alertCount = 0;
    var self = this;
    var positionObserver = {
      observe : function(subject, topic, position)
      {
          if (self.analysis && self.visController)
          {
              // TODO: have position in ms, update processing?
              self.visController.timestamp = position;
              dump("updated position with: " + position + "\n"); 
          }
          // else nothing to be done. Paint a picture of an hourglass?
      }
    };
    
    var positionRemote = Cc["@songbirdnest.com/Songbird/DataRemote;1"].createInstance(Ci.sbIDataRemote);
    positionRemote.init("metadata.position");
    positionRemote.bindObserver(positionObserver, true);
    this.positionRemote = positionRemote;
    
    var selection = this._mediaListView.selection;
    var seedTrack = selection.currentMediaItem; // sbiMediaItem
    if (!seedTrack || selection.count == 0) 
        alert("Please select one (and only one) track.");
        
    var spec = seedTrack.getProperty(SBProperties.contentURL);
    var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var filehandler = ios.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
    var file = filehandler.getFileFromURLSpec(spec);
    var md5 = this.get_md5(file);
    
    var artist = seedTrack.getProperty(SBProperties.artistName)
    var track = seedTrack.getProperty(SBProperties.trackName)
    
    this.getAnalysis(md5, artist, track, spec);
    
    // Get playlist commands (context menu, keyboard shortcuts, toolbar)
    // Note: playlist commands currently depend on the playlist widget.
    var mgr = Cc["@songbirdnest.com/Songbird/PlaylistCommandsManager;1"].createInstance(Ci.sbIPlaylistCommandsManager);
    var cmds = mgr.request(kPlaylistCommands.MEDIAITEM_DEFAULT);
  },
  

  
  // Called as the window is about to unload
  onUnload:  function(e) {
    this.positionRemote.unbind();
  },
  
  // Show/highlight the MediaItem at the given MediaListView index. Called by the Find Current Track button.
  highlightItem: function(aIndex) {},
  
  // Called when something is dragged over the tabbrowser tab for this window
  canDrop: function(aEvent, aSession) {},
  
  // Called when something is dropped on the tabbrowser tab for this window
  onDrop: function(aEvent, aSession) {},
  
} // End window.mediaPage 


