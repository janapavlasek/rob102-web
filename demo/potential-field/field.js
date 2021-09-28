var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var PotentialField = function () {
  function PotentialField(collision_thresh, color_low, color_high) {
    _classCallCheck(this, PotentialField);

    this.collision_thresh = collision_thresh;
    this.color_low = color_low;
    this.color_high = color_high;

    this.increase = false;
    this.brush_radius = 3;
    this.brush_delta = 0.01;

    this.cell_odds = [];
    this.field = [];

    this.fieldGrid = new GridCellCanvas();
    this.canvas = undefined;
  }

  _createClass(PotentialField, [{
    key: 'init',
    value: function init(canvas) {
      this.fieldGrid.init(canvas);
      this.canvas = canvas;

      this.hide();
    }
  }, {
    key: 'hide',
    value: function hide() {
      this.canvas.style.display = 'none';
    }
  }, {
    key: 'show',
    value: function show() {
      this.canvas.style.display = 'block';
    }
  }, {
    key: 'setDraw',
    value: function setDraw(increase) {
      this.increase = increase;
    }
  }, {
    key: 'setBrush',
    value: function setBrush(radius, delta) {
      this.brush_radius = radius;
      this.brush_delta = delta;
    }
  }, {
    key: 'setCells',
    value: function setCells(cells, width, height) {
      this.cell_odds = cells;
      this.fieldGrid.setSize(width, height);
      this.reset();
    }
  }, {
    key: 'reset',
    value: function reset() {
      this.field = Array(this.fieldGrid.width * this.fieldGrid.height).fill(1.0);
      this.drawField();
    }
  }, {
    key: 'drawField',
    value: function drawField() {
      if (this.cell_odds.length !== this.fieldGrid.width * this.fieldGrid.height) {
        return;
      }

      this.fieldGrid.clear();
      for (var i = 0; i < this.fieldGrid.width; i++) {
        for (var j = 0; j < this.fieldGrid.height; j++) {
          var idx = this.fieldGrid.getCellIdx(i, j);
          if (this.cell_odds[idx] > this.collision_thresh) continue;

          var prob = this.field[idx];
          var color = getColor(prob, this.color_low, this.color_high);
          this.fieldGrid.drawCell([j, i], this.fieldGrid.cellSize, color);
        }
      }
    }
  }, {
    key: 'changeFieldCell',
    value: function changeFieldCell(row, col) {
      for (var i = row - this.brush_radius; i < row + this.brush_radius; i++) {
        for (var j = col - this.brush_radius; j < col + this.brush_radius; j++) {
          // Skip cells outside a circle pattern.
          if (Math.pow(i - row, 2) + Math.pow(j - col, 2) > Math.pow(this.brush_radius, 2)) continue;

          var idx = this.fieldGrid.getCellIdx(j, i);
          // Skip out of bounds indicies or indices in collision.
          if (idx < 0 || idx >= this.field.length) continue;
          if (this.cell_odds[idx] > this.collision_thresh) continue;

          var dir = this.increase ? 1 : -1;
          this.field[idx] = Math.min(Math.max(this.field[idx] + dir * this.brush_delta, 0), 1);

          var color = getColor(this.field[idx], this.color_low, this.color_high);
          this.fieldGrid.drawCell([i, j], this.fieldGrid.cellSize, color);
        }
      }
    }
  }, {
    key: 'neighbors8',
    value: function neighbors8(row, col) {
      var nbrs = [];
      for (var i = row - 1; i <= row + 2; i++) {
        for (var j = col - 1; j <= col + 2; j++) {
          var idx = this.fieldGrid.getCellIdx(j, i);
          if (idx < 0 || idx >= this.field.length) continue;
          nbrs.push([i, j]);
        }
      }
      return nbrs;
    }
  }, {
    key: 'gradientDescent',
    value: function gradientDescent(start) {
      var done = false;
      var current = start;
      var curr_idx = this.fieldGrid.getCellIdx(start[1], start[0]);
      var path = [start.slice()];
      while (!done) {
        // Get all neighbors.
        var nbrs = this.neighbors8.apply(this, _toConsumableArray(current));

        // Find the neighbor with the largest delta to the current.
        var max_delta = 0;
        var max_idx = 0;
        for (var n = 0; n < nbrs.length; n++) {
          var idx = this.fieldGrid.getCellIdx(nbrs[n][1], nbrs[n][0]);
          if (this.cell_odds[idx] > this.collision_thresh) continue;

          var grad = this.field[idx] - this.field[curr_idx];
          if (grad < max_delta) {
            max_delta = grad;
            max_idx = n;
          }
        }

        // If there was a lower neighbor, that's the next one to explore.
        if (max_delta < 0) {
          current = nbrs[max_idx];
          curr_idx = this.fieldGrid.getCellIdx(current[1], current[0]);
          path.push(current.slice());
        } else done = true;
      }

      return path;
    }
  }]);

  return PotentialField;
}();