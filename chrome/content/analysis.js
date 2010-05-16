Array.prototype.sum = function () {
    var s = 0;
    for (var i = 0; i < this.length; i++) {
        s += this[i];
    }
    return s;
};

var PITCH_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

function loudness_factor(db) {
    // db is in dBFS, which has a max of 0, and a min (assuming 16-bit) of -96.
    // get a number between 0 and 1 that corresponds to how loud the sound is.
    // these seeems to hover around .8-.9; need more discrimination.
    var unit = (db + 96.0) / 96.0;

    // exaggerate differences at higher end of loudness.
    return Math.pow(10, unit) / 10;
}

function Event(e) {
    this.start = e.start;
    this.duration = e.duration;
    this.key = 0;
    this.loudness = 0;
    this.mode = "fake"; // defaults
    this.alpha = 255; // yikes.
    if (e.confidence) {
        this.confidence = e.confidence;
    }
    else {
        this.confidence = 0; // got no confidence
    }
}

Event.prototype = {
    end: function(){
        return this.start + this.duration;
    },
    
    contains: function (s) {
        return (this.start <= s.start && s.end() <= this.end());
    },
    
    startsWithin: function(s) {
        return (s.start <= this.start && this.start < s.end());
    },
    overlaps: function (s) {
        return (this.start <= s.start && s.start < this.end()) ||
               (this.start < s.end() && s.end() <= this.end());
    },

    computeOverallLoudness: function(segments) {
        var dbSum = 0.0;
        var segment_count = 0;
        for (var j = 0; j < segments.length; j++) {
            var s = segments[j];
            if (this.contains(s)) {
                dbSum += s.dbMax;
                segment_count += 1;
            }
        }
        if (segment_count === 0) {
            this.loudness = 0;
        }
        else {
            this.loudness = dbSum / segment_count;
        }
    },

    computeKey: function (segments) {
        var s, c;
        if (segments === null) {
            return;
        }

        // Build up the chroma for this section
        var chroma = [0,0,0,0,0,0,0,0,0,0,0,0];
        var seg_start = -1;
        var seg_end = 0;
        for (var j = 0; j < segments.length; j++) {
            s = segments[j];
            if (this.contains(s)) {
                seg_end = j;
                if (seg_start == -1) {
                    seg_start = j;
                }

                for (c = 0; c < 12; c++) {
                    chroma[c] = chroma[c] + s.pitches[c];
                }
            }
        }
        if (seg_start == -1) {
            seg_start = 0;
        }

        var major, minor;

        // compute triads.
        var majTriads = [0,0,0,0,0,0,0,0,0,0,0,0];
        var minTriads = [0,0,0,0,0,0,0,0,0,0,0,0];
        for (var i = seg_start; i < seg_end; i++) {
            s = segments[i];
            // Total energy in this chord
            var total = s.pitches.sum();
            if (total <= 0.0001) {
                continue;
            }

            var maxVal = -1.0;
            var major_triad = true;
            // Let's estimate the chord and fill the triadMatrix
            for (j = 0; j < 12; j++) {
                minor = s.pitches[j] + s.pitches[ (j+3) % 12] + s.pitches[ (j+7) % 12]; // minor triad
                if (maxVal < minor)  {
                    maxVal = minor;
                    maxIndex = j;
                    major_triad = false;
                }

                major = s.pitches[j] + s.pitches[ (j+4) % 12 ] + s.pitches[ (j+7) % 12 ]; // major triad
                if (maxVal < major)  {
                    maxVal = major;
                    maxIndex = j;
                    major_triad = true;
                }
            }
            if (major_triad) {
                majTriads[maxIndex] += maxVal / total;
            }
            else {
                minTriads[maxIndex] += maxVal / total;
            }
        }

        // find scales
        var scale_profile = [0,0,0,0,0,0,0,0,0,0,0,0];
        // We define the major scale
        // e.g. for C major: [C, C#, D, D#, E, F, F#, G, G#, A, Bb, B]
        // C, D, E, F, G, A, B => 0, 2, 4, 5, 7, 9, 11
        // In terms of triads, the major scale embeds CM, Dm, Em, FM, GM, Am, Bm
        // We're testing every possible major scale option by summing weights in the corresponding triad bins
        // Note the major scale is equivalent to a relative minor scale
        for (i = 0; i < 12; i++) {
            scale_profile[i]  = majTriads[ (i+0) % 12] +
                                minTriads[ (i+2) % 12] +
                                minTriads[ (i+4) % 12] +
                                majTriads[ (i+5) % 12] +
                                majTriads[ (i+7) % 12] +
                                minTriads[ (i+9) % 12] +
                                minTriads[(i+11) % 12];
        }

        majorKey = 0;
        for (c = 0; c < scale_profile.length; c++) {
            if (scale_profile[majorKey] < scale_profile[c]) {
                majorKey = c;
            }
        }
        // Ok, we've got the right scale, but are we major or minor?
        major = majTriads[majorKey] * chroma[majorKey];

        // The minor third scale below is equivalent to the major scale
        var minorKey = (majorKey + 9) % 12;
        minor = minTriads[minorKey] * chroma[minorKey];

        this.key = (minorKey <= majorKey) ? majorKey : minorKey;
        this.mode = (minorKey <= majorKey) ? "major" : "minor";
    }
};

function TrackInfo(t) {
    this.bpm = t.track.tempo;
    this.key = t.track.key;
    this.mode = t.track.mode ? "major" : "minor";
    this.mode_confidence = t.track.mode_confidence;
    this.duration = t.track.duration;
    this.meter = t.track.time_signature;
    this.end_of_fade_in = t.track.end_of_fade_in;
    this.start_of_fade_out = t.track.start_of_fade_out;
    // Overall loudness is a function of the local maximum loudness, the dynamic range, and the overall top loudness.
    // The greater the dynamic range, the more influential it is on turning down the overall loudness.
    // As a result, highly compressed music sounds louder than non compressed music, even if their maximum loudnesses are similar.
    // Ratios are currently empirical and would require a user study.
    this.overall_loudness = t.track.loudness;
    

    this.segments = [];
    for (var i = 0; i < t.segments.length; i++) {
        this.segments[i] = new Segment(t.segments[i], this);
    }

    this.max_loudness = 0;
    this.min_loudness = -96; // min 16-bit dbFS
    if (0 < this.segments.length) {
        this.max_loudness = this.segments[0].dbMax;
        this.min_loudness = this.segments[0].dbMax;
        for (i = 0; i < this.segments.length; i++) 
        {
            if (this.max_loudness < this.segments[i].dbMax)
                this.max_loudness = this.segments[i].dbMax;
                
            if (this.min_loudness > this.segments[i].dbMax)
                this.min_loudness = this.segments[i].dbMax;
        }
    }

    this.sections = this.parseEventList(t.sections, null);
    this.fixSections(); // Sections need some lovin' before we assign keys.
    for (i = 0; i < this.sections.length; i++) {
        this.sections[i].computeKey(this.segments);
        this.sections[i].computeOverallLoudness(this.segments);
    }

    this.bars = this.parseEventList(t.bars, this.segments);
    this.beats = this.parseEventList(t.beats, this.segments);
    this.tatums = this.parseEventList(t.tatums, null);
    
    var curr = 0;
    var max_count = 0;
    var x_per_y = 0;
    var x = this.tatums;
    var y = this.bars;
    for (i = 0; i < x.length; i++)
    {
        if (curr < y.length && y[curr].contains(x[i]))
            x_per_y += 1;
        else
        {
            if (max_count < x_per_y)
                max_count = x_per_y;
            x_per_y = 1;
            curr += 1;
        }
    }
    this.max_tatums_per_bar = max_count;
    //console.log('max tatums per bar', max_count);
    
    // Compute timbre range to provide better colors.
    this.timbreMin = [500,500,500,500,500,500,500,500,500,500,500,500];
    this.timbreMax = [0,0,0,0,0,0,0,0,0,0,0,0];
    this.timbreMean = [0,0,0,0,0,0,0,0,0,0,0,0];
    for (i = 0; i < this.segments.length; i++) 
    {
        var s = this.segments[i];
        for (var j = 0; j < 12; j++)
        {
            var tim = s.timbre[j];
            this.timbreMean[j] += tim;
            
            if (tim < this.timbreMin[j])
                this.timbreMin[j] = tim;
            
            if (this.timbreMax[j] < tim)
                this.timbreMax[j] = tim;
        }
    }
    //std dev
    this.timbreStd = [0,0,0,0,0,0,0,0,0,0,0,0];
    for (var j = 0; j < 12; j++)
    {
        for (i = 0; i < this.segments.length; i++)
        {
            var diff = (this.segments[i].timbre[j] - this.timbreMean[j]);
            this.timbreStd[j] += diff * diff;
        }
        this.timbreStd[j] = Math.sqrt(this.timbreStd[j] / this.segments.length);
    }
    
}

TrackInfo.prototype = {
    parseEventList: function (event_list, segment_list) {
        var data = [];

        for (var i = 0; i < event_list.length; i++) {
            data[i] = new Event(event_list[i]);
            // TODO: This is grossly inefficient. Fix by only giving relevant segments.
            if (segment_list) {
                data[i].computeKey(segment_list);
                data[i].computeOverallLoudness(segment_list);
            }
        }
        return data;
    },

    fixSections: function () {
        // Fix a bug in an3 where the last section doesn't extend to the end of the track.
        var last = this.sections.length -1;
        if (0 <= last) {
            this.sections[last].duration = this.duration - this.sections[last].start;
        }

        // Split the first section into a fadein and the rest.
        if (0.2 < this.end_of_fade_in && 0 < this.sections.length) {
            if (this.end_of_fade_in < this.sections[0].duration) {
                var s = new Event(this.sections[0]);
                s.duration = this.end_of_fade_in;
                s.fadein = true;
                this.sections[0].start = this.end_of_fade_in;
                this.sections[0].duration -= this.end_of_fade_in;
                this.sections.unshift(s);
            }
            else {
                this.sections[0].fade = true;
            }
        }

        // split the lst section into 2; a fadeout and the other part.
        last = this.sections.length - 1;
        if (this.start_of_fade_out < this.duration && 0 <= last) {
            if (this.sections[last].start < this.start_of_fade_out) {
                var s = new Event(this.sections[last]);
                this.sections[last].duration = this.start_of_fade_out - this.sections[last].start;
                s.start = this.start_of_fade_out;
                s.duration = this.duration - this.start_of_fade_out;
                s.fadeout = true;
                this.sections.push(s);
            }
            else {
                this.sections[last].fade = true; // good enough.
            }
        }
    }
};

function Segment(s, t) {
    this._track = t;
    this.timbre = s.timbre;
    this.pitches = s.pitches;

    this.start = s.start;
    this.duration = s.duration;
    this.loudness = s.loudness_max; // for consistency of interface with Event.
    this.start_max = s.loudness_max_time;

    this.dbStart = s.loudness_start;
    this.dbMax = s.loudness_max;
    this.dbsf = loudness_factor(this.dbStart);
    this.dbmf = loudness_factor(this.dbMax);
    this.loudness_end = s.loudness_end;
}

Segment.prototype = {
    end: function() 
    {
        return this.start + this.duration;
    }
};
