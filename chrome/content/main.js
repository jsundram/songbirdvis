
// Make a namespace.
if (typeof Visualizerfm == 'undefined') {
  var Visualizerfm = {};
}

/**
 * UI controller that is loaded into the main player window
 */
Visualizerfm.Controller = {

  /**
   * Called when the window finishes loading
   */
  onLoad: function() {

    // initialization code
    this._initialized = true;
    this._strings = document.getElementById("visualizerfm-strings");
    
    // Perform extra actions the first time the extension is run
    if (Application.prefs.get("extensions.visualizerfm.firstrun").value) {
      Application.prefs.setValue("extensions.visualizerfm.firstrun", false);
      this._firstRunSetup();
    }


    

    // Make a local variable for this controller so that
    // it is easy to access from closures.
    var controller = this;
    
    // Attach doHelloWorld to our helloworld command
    this._helloWorldCmd = document.getElementById("visualizerfm-helloworld-cmd");
    this._helloWorldCmd.addEventListener("command", 
         function() { controller.doHelloWorld(); }, false);

  },
  

  /**
   * Called when the window is about to close
   */
  onUnLoad: function() {
    this._initialized = false;
  },
  

  /**
   * Sample command action
   */
  doHelloWorld : function() {
    var message = "Visualizerfm: " + this._strings.getString("helloMessage");
    alert(message);
  },

  
  /**
   * Perform extra setup the first time the extension is run
   */
  _firstRunSetup : function() {
  
    // Call this.doHelloWorld() after a 3 second timeout
    setTimeout(function(controller) { controller.doHelloWorld(); }, 3000, this); 
  
  },
  
  

  
};

window.addEventListener("load", function(e) { Visualizerfm.Controller.onLoad(e); }, false);
window.addEventListener("unload", function(e) { Visualizerfm.Controller.onUnLoad(e); }, false);
