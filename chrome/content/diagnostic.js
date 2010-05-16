// based on TJ's matlab plots.
// TODO: zoom stacking?

// AUTHOR: <a href="http://twitter.com/jsundram">Jason Sundram</a>

/*BEGIN_DOCSTRING 

The <b>diagnostic</b> visualizer was used by The Echo Nest audio team while developing <a href="http://developer.echonest.com/news/2009/10/analysis-version-3-now-default/">the new analyzer</a>.
<p><br>
<p>
It shows (from top to bottom):
<ol>
<li>Timbre, colored by mapping dimensions 2-4 into the RGB color space.</li>
<li>Pitch, colored by the wavelength of light corresponding to the frequency of each pitch (e.g. A = 440).</li>
<li>Loudness. Thickness represents the difference between the start and max loudness for each segment.</li>
<li>Meter.  Blue dots are bars, Red dots are beats, and white dots are tatums. The curves represent the corresponding confidences.</li>
</ol>
</p>
<p>
<br>
Special Features:
<ol>
<li>Zoom. Drag to select a section to zoom in on. Press Escape to zoom out.</li>
<li>Scrub. Click anyplace on the visualizer to hear the music at that point.</li>
</ol>
</p>
END_DOCSTRING*/

var BG = 0;
var FG = 255;

if (typeof(Cc) == 'undefined')
  var Cc = Components.classes;
if (typeof(Ci) == 'undefined')
  var Ci = Components.interfaces;
if (typeof(Cu) == 'undefined')
  var Cu = Components.utils;
if (typeof(Cr) == 'undefined')
  var Cr = Components.results

// import required modules  
Cu.import("resource://app/jsmodules/sbProperties.jsm");

if (typeof DiagnosticVis == 'undefined')
  var DiagnosticVis = {};
/*
Rect.prototype.draw = function(p, fill_color, fill_alpha)
{
  p.pushStyle();
  p.fill(fill_color, fill_alpha);
  p.rect(this.left, this.top, this.width, this.height);//pjs function
  p.popStyle();
}
*/


DiagnosticVis.Controller = {
    p : null,
    TRACK : null,
    TRACK_START : null,
    TRACK_END : null,
    track_changed : false, // TODO: not sure how to deal with this
    timestamp : -1,
    current_track : null,
    
    curr_height : null,
    curr_width : null,
    resized : false,
    all : null,
    old_scrub : null,
    
    startX :null,
    startY : null,
    DRAGGED : false,
    PITCH_COLORS : [-13631744, -6226176, -7424, -42496, -65536, -65536, -5832704, -10354507, -12386062, -16776961, -16743169, -16711720],
    PITCH_LABELS : ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"], // TODO: could also get these from analysis.js
    
    setupProcessing: function(sketchInfo)
    {
        this.p = Processing(sketchInfo.canvas, "");
        var p = this.p; //brevity
        var self = this;
        p.setup         = function() { self.setup(sketchInfo); };
        p.draw          = function() { self.draw(p); };
        p.mouseClicked  = function() { self.mouseClicked(p); };
        p.mousePressed  = function() { self.mousePressed(p); };
        p.mouseReleased = function() { self.mouseReleased(p); };
        p.mouseDragged  = function() { self.mouseDragged(p); };
        p.keyPressed = function()    { self.keyPressed(p.key); };
        p.init();
    },
    
    setup : function(sketchInfo)
    {
        this.curr_width = parseInt(sketchInfo.width);
        this.curr_height = parseInt(sketchInfo.height);
        this.TRACK = sketchInfo.analysis;
        this.p.size(this.curr_width, this.curr_height);
        this.p.background(BG);
        // frameRate. default is 60. If the average track is 120bpm, that's 2 bps, 
        // so this is good for a segment rate of up to 15 segments/beat.
        this.p.frameRate(30);
    },
    
    formatTime : function(seconds)
    {
        var x = 0.01 + seconds; 
        var s = x % 60;
        var m = (x - s) / 60;
        return this.p.nf(m, 2) + ":" + this.p.nf(s, 2, 1);
    },
    
    // Zoom and Seek
    keyPressed : function(key)
    {
        if (this.TRACK && key == this.p.ESC)
        {
            if (this.TRACK_START != 0 || this.TRACK_END != this.TRACK.duration)
            {
                this.TRACK_START = 0;
                this.TRACK_END = this.TRACK.duration;
                this.resized = true;
            }
        }
    },
    
    mousePressed : function()
    {
        this.startX = this.p.mouseX;
        this.startY = this.p.mouseY;
    },
    
    offset_to_seconds : function(x_offset)
    {
        return this.TRACK_START + (x_offset / this.p.width) * (this.TRACK_END - this.TRACK_START);
    },
    
    drawDragRect : function(erase)
    {
        if (!this.DRAGGED)
            return;
        this.p.pushStyle();
        if (erase)
            this.p.image(this.all, 0, 0);
        this.p.fill(255, 96);
        this.p.rectMode(this.p.CORNERS);
        this.p.rect(this.startX, 0, this.p.mouseX, this.p.height);
        s = this.offset_to_seconds(this.startX);
        e = this.offset_to_seconds(this.p.mouseX);
        this.p.textFont("Arial", 10);
        this.p.text(this.formatTime(s), this.startX + 8, 10);
        this.p.text(this.formatTime(e), this.p.mouseX + 8, 10);
        this.p.popStyle();
    },
    
    mouseDragged : function()
    {
        this.DRAGGED = true;
        this.drawDragRect(true);
    },
    
    mouseReleased : function()
    {
        if (this.DRAGGED)
        {
            // console.log('Dragged from', startX, startY, ' to ', mouseX, mouseY);
            var x1 = min(this.p.mouseX, this.startX);
            var x2 = max(this.p.mouseX, this.startX);
            var new_start = this.offset_to_seconds(x1);
            var new_end   = this.offset_to_seconds(x2);
            if ( 1 < new_end - new_start)
            {
                this.TRACK_START = new_start;
                this.TRACK_END = new_end;
                this.resized = true;
            }
            else
                this.p.image(this.all, 0, 0);
        }
        this.DRAGGED = false;
        this.startX = null;
        this.startY = null;
    },
    
    mouseClicked : function(p)
    {
        if (this.TRACK)
        {
            // Since we're drawing from L to R with no border, math is simple.
            var seek = this.offset_to_seconds(this.p.mouseX) * 1000;
            
            var gMM = Cc["@songbirdnest.com/Songbird/Mediacore/Manager;1"].getService(Ci.sbIMediacoreManager);
            gMM.playbackControl.position = seek;
        }
    },
    
    draw : function(p)
    {
        // TODO, get h, w
        var h = this.curr_height;
        var w = this.curr_width;
        if (this.curr_height != h || this.curr_width != w)
        {
            this.curr_height = h;
            this.curr_width = w;
            this.resized = true;
            try
            {
                p.size(w, h);
            }
            catch(e)
            {
                p.background(BG); 
            }
        }
        
        // TODO: Get current track
        if (this.TRACK != null)
        {
            var track_changed = (this.TRACK != this.current_track);
            if (track_changed)
            {
                this.current_track = this.TRACK;
                this.TRACK_START = 0;
                this.TRACK_END = this.TRACK.duration;
            }
            
            var scrubber_height = 10;
            var meta = new Rect(0, 0, p.width, scrubber_height);
            var scrubber = new Rect(0, meta.bottom(), p.width, scrubber_height);
            if (track_changed || this.resized)
            {
                p.background(BG);
                
                //this.drawTrackLevel(p, this.TRACK, meta);
                
                // *3 because of meta, scrubber, and space between timbre and pitch
                var h = (p.height - scrubber_height * 3) / 4;
                
                var timbre = new Rect(0, scrubber.bottom(), p.width, h);
                this.drawTimbre(p, this.TRACK, timbre);
                
                var pitch = new Rect(0, timbre.bottom() + scrubber_height, p.width, h);
                this.drawPitch(p, this.TRACK, pitch);
                
                var loudness = new Rect(0, pitch.bottom(), p.width, h);
                this.drawLoudness(p, this.TRACK, loudness);
                
                var meter = new Rect(0, loudness.bottom(), p.width, h);
                this.drawMeter(p, this.TRACK, meter);
                
                this.all = p.get();
            }
            
            this.drawScrubber(p, this.TRACK, scrubber);
        }
        
        this.resized = false; // after we've made it through a draw loop, we've resized.
    },
    
    drawTrackLevel: function(p, t, r)
    {
        p.pushStyle();
        p.fill(255);
        // TODO: add more confidences.
        p.textFont("Arial", 10);
        p.text(p.nf(t.bpm, 3, 1) + " bpm in " + p.nf(t.meter, 1) + "/4.", r.right()-160, r.bottom());
        p.text(this.PITCH_LABELS[t.key] + "  "  + t.mode + " (" + p.nf(t.mode_confidence, 1, 2) + ")", r.right() - 80, r.bottom());
        p.popStyle();
    },
    
    drawScrubber: function(p, t, r)
    {
        p.pushStyle();
        
        var timestamp = this.timestamp;
        if (timestamp < this.TRACK_START || this.TRACK_END < timestamp)
        {
            r.draw(p, 0, 255); // blank us out
            return;
        }
        
        var frac = (timestamp - this.TRACK_START) / (this.TRACK_END - this.TRACK_START);
        
        var x = r.left + frac * r.width;
        if (x != this.old_scrub)
        {
            this.old_scrub = x;
            
            p.image(this.all, 0, 0);
            this.drawDragRect(false);
            
            p.fill(204, 102, 0, 95);
            p.rect(x, r.top, 4, p.height); // 4 => knob width
            
            p.stroke(255);
            p.fill(255);
            p.textFont("Arial", 10);
            p.text(this.formatTime(timestamp) + " / " + this.formatTime(t.duration), x + 8, r.bottom());
        }
        p.popStyle();
    },
    
    drawTimbre : function(p, t, r)
    {
        p.pushStyle();
        var curr = r.left;
        var w = 0;
        var h = r.height / 12;
        
        for (var i = 0; i < t.segments.length; i++)
        {
            var current = t.segments[i];
            if (current.start < this.TRACK_START || this.TRACK_END < current.end())
                continue;
            var w = r.width * current.duration / (this.TRACK_END - this.TRACK_START);
            
            var R = p.map(current.timbre[1], t.timbreMin[1], t.timbreMax[1], 0, 255);
            var G = p.map(current.timbre[2], t.timbreMin[2], t.timbreMax[2], 0, 255);
            var B = p.map(current.timbre[3], t.timbreMin[3], t.timbreMax[3], 0, 255);
            
            for (var j = 0; j < 12; j++)
            {
                var timbre = p.map(current.timbre[j], t.timbreMin[j], t.timbreMax[j], 0, 255);
                p.fill(R, G, B, timbre);
                p.rect(curr, r.top + j*h, w, h);
            }
            
            curr += w;
        }
        p.popStyle();
    },
    
    drawPitch : function(p, t, r)
    {
        p.pushStyle();
        var curr = r.left;
        var w = 0;
        var h = r.height / 12;
        
        for (var i = 0; i < t.segments.length; i++)
        {
            var current = t.segments[i]; 
            if (current.start < this.TRACK_START || this.TRACK_END < current.end())
                continue;
            var w = r.width * current.duration / (this.TRACK_END - this.TRACK_START);
            
            var pmin = p.min(current.pitches);
            var pwidth = p.min(current.pitches) - pmin;
            if (pwidth < .001)
                pwidth = .1; // avoid dividing by 0
            
            var k = (t.key + 11) % 12;
            for (var c = 0; c < 12; c++)
            {
                var chroma = (current.pitches[k] - pmin) / pwidth; // now in range 0, 1
                p.fill(this.PITCH_COLORS[k], chroma * 255);
                p.rect(curr, r.bottom() - (c+1)*h, w, h);
                
                k = ((k - 1) + 12) % 12;
            }
            
            curr += w;
        }
        p.popStyle();
    },
    
    plot : function(p, l, r, x_min, x_max, f)
    {
        p.pushStyle();
        p.fill(f); 
        var y_max = 1; // calculating this scales everything together, which is not what we want.
        
        for (var i = 0; i < l.length; i++)
        {
            var m = l[i];
            if (m.start < x_min || x_max < m.end())
                continue;
            
            var s = m.start;
            var d = m.duration / 4; // Perhaps you are wondering about the /4. Me too.
            var c = m.confidence;
            
            var pt_x = p.map(s, x_min, x_max, r.left, r.right());
            var pt_y = p.map(d, 0, y_max, r.bottom(), r.top);
            var pt_c = p.map(c, 0, 1, r.bottom(), r.top);
            
            p.rect(pt_x, pt_y, 4, 4); // place a marker
            
            if (i != 0)
            {
                p.stroke(f, 94);
                p.line(last_x, last_c, pt_x, pt_c);
            }
            var last_x = pt_x;
            var last_c = pt_c;
        }
        
        p.popStyle();
    },
    
    drawMeter : function(p, t, r)
    {
        if (true)
            this.plot(p, t.tatums, r, this.TRACK_START, this.TRACK_END, p.color(FG));
        if (true)
            this.plot(p, t.beats, r, this.TRACK_START, this.TRACK_END, p.color(255, 0, 0));
        if (t.meter != 1) // if track.meter == 1, bars == beats.
            this.plot(p, t.bars, r, this.TRACK_START, this.TRACK_END, p.color(0, 0, 255));
        
        p.pushStyle();
        p.fill(128, 94); 
        for (var i = 0; i < t.sections.length; i++)
        {
            var m = t.sections[i];
            
            if (m.start < this.TRACK_START || this.TRACK_END < m.end())
                continue;
            
            var s = m.start;
            var d = m.duration / 4; // Perhaps you are wondering about the /4. Me too.
            var c = m.confidence
            
            var pt_x = p.map(s, 0, t.duration, r.left, r.right());
            var pt_y = p.map(d, 0, 1, r.bottom(), r.top); // Just a guess, should fix
            var pt_c = p.map(c, 0, 1, 2, 8); 
            
            p.rect(pt_x - pt_c / 2, r.top, pt_c, r.height);
        }
        
        p.popStyle();
    },
    
    drawLoudness : function(p, t, r)
    {
        p.pushStyle();
        p.fill(204, 102, 0, 255); // orange
        // draw loudness
        p.beginShape();
        var min_loudness = -60;
        var max_loudness = 0; // T had 20; do we really need that?
        // max_loudness
        for (var i = 0; i < t.segments.length; i++)
        {
            var seg = t.segments[i];
            if (seg.start < this.TRACK_START || this.TRACK_END < seg.end())
                continue;
            
            var x = seg.start + seg.start_max;
            var y = seg.dbMax;
            
            var pt_x = p.map(x, this.TRACK_START, this.TRACK_END, r.left, r.right());
            var pt_y = p.map(y, min_loudness, max_loudness, r.bottom(), r.top);
            p.vertex(pt_x, pt_y);
        }
        
        // deal with loudness_end
        if (t.segments[i-1].loudness_end <= this.TRACK_END)
        {
            pt_x = r.right();
            pt_y = p.map(t.segments[i-1].loudness_end, min_loudness, max_loudness, r.bottom(), r.top);
            p.vertex(pt_x, pt_y);
        }
        
        // loudness_start
        for (var i = t.segments.length-1; i >= 0; i--)
        {
            seg = t.segments[i];
            if (seg.start < this.TRACK_START || this.TRACK_END < seg.end())
                continue;
            
            x = seg.start;
            y = seg.dbStart;
            
            pt_x = p.map(x, this.TRACK_START, this.TRACK_END, r.left, r.right());
            pt_y = p.map(y, min_loudness, max_loudness, r.bottom(), r.top);
            p.vertex(pt_x, pt_y);
        }
        p.endShape(p.CLOSE);
        
        p.stroke(255);
        var loud = p.map(t.overall_loudness, min_loudness, max_loudness, r.bottom(), r.top);
        var fin = r.left + 10;
        if (this.TRACK_START < t.end_of_fade_in && t.end_of_fade_in < this.TRACK_END)
            fin = p.map(t.end_of_fade_in, this.TRACK_START, this.TRACK_END, r.left, r.right());
        
        var fout = r.right() - 10;
        if (this.TRACK_START < t.start_of_fade_out && t.start_of_fade_out < this.TRACK_END)
            fout = p.map(t.start_of_fade_out, this.TRACK_START, this.TRACK_END, r.left, r.right());
        
        p.line(fin, loud, fout, loud);        // loudness
        p.line(fin, r.bottom(), fin, loud);   // fadein
        p.line(fout, r.bottom(), fout, loud); // fadeou
        
        p.fill(FG);
        
        p.textFont("Arial", 12);
        p.text("loudness = " + p.nf(t.overall_loudness, 2, 1) + "dB", r.left + 10, loud - 10);
        p.popStyle();
    }
};
