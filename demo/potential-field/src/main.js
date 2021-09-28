'use strict';

var config = {
  // Sim info
  MAP_DISPLAY_WIDTH: 800,   // px
  ROBOT_SIZE: 0.274,        // m, diameter
  ROBOT_DEFAULT_SIZE: 100,  // px
  COLLISION_THRESHOLD: 0.5,

  // Display info
  MAP_COLOUR_HIGH: "#00274C",      // Michigan blue
  MAP_COLOUR_LOW: "#ffffff",       // White
  FIELD_COLOUR_HIGH: "#2F65A7", // "#2196F3", //"#444444",    // Grey
  FIELD_COLOUR_LOW: "#ffffff",     // White
  FIELD_ALPHA: "FF",
  PATH_COLOUR: "#00B2A9",          // Taubman Teal
  VISITED_CELL_COLOUR: "#989C97",  // Angell Hall Ash
  CLICKED_CELL_COLOUR: "#FFCB05",  // Maize
  GOAL_CELL_COLOUR: "#00ff00",
  BAD_GOAL_COLOUR: "#ff0000",
  SMALL_CELL_SCALE: 0.8,

  // Drawing info
  PAINT_CELL_DELTA: 0.01,
  PAINTBRUSH_RADIUS: 3,
};


function MapFileSelect(props) {
  return (
    <div className="file-input-wrapper">
      <input className="file-input" type="file" onChange={props.onChange} />
    </div>
  );
}

/*******************
 * DRAWING HELPERS
 *******************/

function colourStringToRGB(colour_str) {
  var rgb = [parseInt(colour_str.substring(1, 3), 16),
             parseInt(colour_str.substring(3, 5), 16),
             parseInt(colour_str.substring(5, 7), 16)];
  return rgb;
}

function getColor(prob, colour_low, colour_high) {
  // Takes a probability (number from 0 to 1) and converts it into a color code
  var colour_low_a = colourStringToRGB(colour_low);
  var colour_high_a = colourStringToRGB(colour_high);

  var hex = function(x) {
    x = x.toString(16);
    return (x.length == 1) ? '0' + x : x;
  };

  var r = Math.ceil(colour_high_a[0] * prob + colour_low_a[0] * (1 - prob));
  var g = Math.ceil(colour_high_a[1] * prob + colour_low_a[1] * (1 - prob));
  var b = Math.ceil(colour_high_a[2] * prob + colour_low_a[2] * (1 - prob));

  var color = hex(r) + hex(g) + hex(b);
  return "#" + color;
}


class GridCellCanvas {
  constructor() {
    this.canvas = null;
    this.ctx = null;

    this.width = 0;
    this.height = 0;
    this.cellSize = 0;
  }

  init(canvas) {
    this.canvas = canvas;

    this.ctx = this.canvas.getContext('2d');
    this.ctx.transform(1, 0, 0, -1, 0, 0);
    this.ctx.transform(1, 0, 0, 1, 0, -this.canvas.width);

    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.cellSize = this.canvas.width / this.width;
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.cellSize = this.canvas.width / this.width;
  }

  getCellIdx(i, j) {
    return i + j * this.width;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawCell(cell, size, color, scale=1) {
    var i = cell[1];
    var j = cell[0];
    var shift = size * (1 - scale) / 2;
    var start_x = i * size + shift;
    var start_y = j * size + shift;

    this.ctx.beginPath();
    this.ctx.fillStyle = color;
    this.ctx.fillRect(start_x, start_y, size * scale, size * scale);
  }

  drawCells(cells, colour_low, colour_high, alpha="ff") {
    if (cells.length !== this.width * this.height) {
      return;
    }

    this.clear();
    for (var i = 0; i < this.width; i++) {
      for (var j = 0; j < this.height; j++) {
        var prob = cells[this.getCellIdx(i, j)];
        var color = getColor(prob, colour_low, colour_high);
        this.drawCell([j, i], this.cellSize, color + alpha);
      }
    }
  }

  clearCell(cell, size) {
    var start_x = cell[1] * size;
    var start_y = cell[0] * size;

    this.ctx.clearRect(start_x, start_y, size, size);
  }
}


/*******************
 * MAP HELPERS
 *******************/

function parseMap(data) {
  var map = {};

  var lines = data.trim().split('\n');
  var header = lines.shift();
  header = header.split(/\s+/);

  map.origin = [parseFloat(header[0]), parseFloat(header[1])];
  map.width = parseFloat(header[2]);
  map.height = parseFloat(header[3]);
  map.meters_per_cell = parseFloat(header[4]);
  map.num_cells = map.width * map.height;

  map.cells = [];

  for (let line of lines) {
    line = line.trim().split(/\s+/);

    if (line.length == 1) continue;

    for (let ele of line) {
      map.cells.push(parseInt(ele));
    }
  }

  map.cells = normalizeList(map.cells);

  if (map.cells.length !== map.num_cells) {
    console.warn("Map has wrong number of cells:", map.cells.length, "!==", map.num_cells);
  }

  return map;
}

function normalizeList(list) {
  if (list.length < 1) return list;
  if (list.length === 1) return [1];

  // Find min and max values.
  // Note: Using JavaScript's Math.min(...) and Math.min(...) causes issues if
  // the array is too big to unpack.
  var min_val = list[0];
  var max_val = list[0];

  for (var i = 1; i < list.length; i++) {
    min_val =  list[i] < min_val ? list[i] : min_val;
    max_val =  list[i] > max_val ? list[i] : max_val;
  }

  // Normalize the values.
  for (var i = 0; i < list.length; i++) {
    list[i] = (list[i] - min_val) / (max_val - min_val);
  }

  return list;
}

/*******************
 *     ROBOT
 *******************/

class DrawRobot extends React.Component {
  constructor(props) {
    super(props);

    this.robotCanvas = null;
    this.robotCtx = null;

    this.robotPos = [config.MAP_DISPLAY_WIDTH / 2, config.MAP_DISPLAY_WIDTH / 2];
    this.robotSize = config.ROBOT_DEFAULT_SIZE;
    this.robotAngle = 0;

    this.robotImage = new Image(config.ROBOT_DEFAULT_SIZE, config.ROBOT_DEFAULT_SIZE);
    this.robotImage.src = 'assets/images/mbot.png';
  }

  componentDidMount() {
    this.robotCanvas = this.refs.robotCanvas;

    this.robotCtx = this.robotCanvas.getContext('2d');
    this.robotCtx.transform(1, 0, 0, -1, 0, 0);
    this.robotCtx.transform(1, 0, 0, 1, 0, -this.robotCanvas.width);

    // Apply the current transform since it will be cleared when first drawn.
    this.robotCtx.translate(this.robotPos[0], this.robotPos[1]);
    this.robotCtx.rotate(this.robotAngle);
  }

  drawRobot() {
    // Clear the robot position.
    this.robotCtx.clearRect(-this.robotSize / 2, -this.robotSize / 2, this.robotSize, this.robotSize);

    // Reset the canvas since the last draw.
    this.robotCtx.rotate(-this.robotAngle);
    this.robotCtx.translate(-this.robotPos[0], -this.robotPos[1]);

    if (this.props.loaded) {
      // this updates position
      this.robotPos = [this.props.x, this.props.y];
      this.robotSize = config.ROBOT_SIZE * this.props.pixelsPerMeter;
      this.robotAngle = this.props.theta;
    }

    this.robotCtx.translate(this.robotPos[0], this.robotPos[1]);
    this.robotCtx.rotate(this.robotAngle);

    // TODO: Scale the image once instead of every time.
    this.robotCtx.drawImage(this.robotImage, -this.robotSize / 2, -this.robotSize / 2, this.robotSize, this.robotSize);
  }

  componentDidUpdate() {
    this.drawRobot();
  }

  render() {
    return (
      <canvas ref="robotCanvas" width={config.MAP_DISPLAY_WIDTH} height={config.MAP_DISPLAY_WIDTH}>
      </canvas>
    );
  }
}

/*******************
 *     CANVAS
 *******************/

 class DrawMap extends React.Component {
  constructor(props) {
    super(props);

    this.mapGrid = new GridCellCanvas();
  }

  componentDidMount() {
    this.mapGrid.init(this.refs.mapCanvas);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return nextProps.cells !== this.props.cells;
  }

  componentDidUpdate() {
    this.mapGrid.setSize(this.props.width, this.props.height);
    this.mapGrid.drawCells(this.props.cells, config.MAP_COLOUR_LOW, config.MAP_COLOUR_HIGH);
  }

  render() {
    return (
      <canvas ref="mapCanvas" width={config.MAP_DISPLAY_WIDTH} height={config.MAP_DISPLAY_WIDTH}>
      </canvas>
    );
  }
}

class DrawCells extends React.Component {
  constructor(props) {
    super(props);

    this.pathUpdated = true;
    this.clickedUpdated = true;
    this.goalUpdated = true;

    this.cellGrid = new GridCellCanvas();
  }

  componentDidMount() {
    this.cellGrid.init(this.refs.cellsCanvas);
  }

  drawPath() {
    for (var i in this.props.path) {
      this.cellGrid.drawCell(this.props.path[i], this.props.cellSize,
                             config.PATH_COLOUR, config.SMALL_CELL_SCALE);
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    this.pathUpdated = nextProps.path !== this.props.path;
    this.clickedUpdated = nextProps.clickedCell !== this.props.clickedCell;
    this.goalUpdated = nextProps.goalCell !== this.props.goalCell;

    if (this.clickedUpdated && this.props.clickedCell.length > 0) {
      this.cellGrid.clearCell(this.props.clickedCell, this.props.cellSize)
    }
    if (this.goalUpdated && this.props.goalCell.length > 0) {
      this.cellGrid.clearCell(this.props.goalCell, this.props.cellSize)
    }

    return (this.pathUpdated || this.clickedUpdated || this.goalUpdated);
  }

  componentDidUpdate() {
    // The first time the visited cells are null, the map was reset. Clear the
    // canvas. Make sure this is only done once using this.clear.
    this.cellGrid.clear();

    // If the map has been loaded, we can draw the cells.
    if (this.props.loaded) {
      // Draw the found path.
      if (this.pathUpdated) {
        this.drawPath();
      }

      // If there's a clicked cell, draw it.
      if (this.props.clickedCell.length > 0) {
        this.cellGrid.drawCell(this.props.clickedCell, this.props.cellSize,
                               config.CLICKED_CELL_COLOUR, config.SMALL_CELL_SCALE);
      }

      // If there's a goal cell, clear it in case it was clicked then draw it.
      if (this.props.goalCell.length > 0) {
        this.cellGrid.clearCell(this.props.goalCell, this.props.cellSize);
        var colour = this.props.goalValid ? config.GOAL_CELL_COLOUR : config.BAD_GOAL_COLOUR;
        this.cellGrid.drawCell(this.props.goalCell, this.props.cellSize,
                               colour, config.SMALL_CELL_SCALE);
      }
    }
  }

  render() {
    return (
      <canvas ref="cellsCanvas" width={config.MAP_DISPLAY_WIDTH} height={config.MAP_DISPLAY_WIDTH}>
      </canvas>
    );
  }
}


/*******************
 *   WHOLE PAGE
 *******************/

class SceneView extends React.Component {
  constructor(props) {
    super(props);

    // React state.
    this.state = {
      cells: [],
      width: 0,
      height: 0,
      num_cells: 0,
      origin: [0, 0],
      metersPerCell: 0,
      pixelsPerMeter: 0,
      cellSize: 0,
      mapLoaded: false,
      x: config.MAP_DISPLAY_WIDTH / 2,
      y: config.MAP_DISPLAY_WIDTH / 2,
      theta: 0,
      mapfile: null,
      path: [],
      clickedCell: [],
      goalCell: [],
      goalValid: true,
      showField: false,
      isRobotClicked: false,
      isUserDrawing: false,
      drawFieldIncrease: false,
    };

    this.field = [];
    this.fieldGrid = new GridCellCanvas();
  }

  componentDidMount() {
    this.fieldGrid.init(this.refs.fieldCanvas);
    this.refs.fieldCanvas.style.display = 'none';
  }

  posToPixels(x, y) {
    var u = (x * this.state.cellSize);
    var v = (y * this.state.cellSize);

    return [u, v];
  }

  updateMap(result) {
    var loaded = result.cells.length > 0;
    this.setState({cells: result.cells,
                   width: result.width,
                   height: result.height,
                   num_cells: result.num_cells,
                   origin: result.origin,
                   metersPerCell: result.meters_per_cell,
                   cellSize: config.MAP_DISPLAY_WIDTH / result.width,
                   pixelsPerMeter: config.MAP_DISPLAY_WIDTH / (result.width * result.meters_per_cell),
                   mapLoaded: loaded,
                   path: [],
                   clickedCell: [],
                   goalCell: []});

    this.field = Array(result.num_cells).fill(1.0);
    this.fieldGrid.setSize(this.state.width, this.state.height);
    this.drawField(this.field);
  }

  onFileChange(event) {
    this.setState({ mapfile: event.target.files[0] });
  }

  onFileUpload() {
    if (this.state.mapfile === null) return;

    var fr = new FileReader();
    fr.onload = (evt) => {
      var map = parseMap(fr.result);
      this.updateMap(map);
    }
    fr.readAsText(this.state.mapfile);

    // var map_data = {type: "map_file",
    //                 data: { file_name: this.state.mapfile.name } };
  };

  onMapClick(x, y) {
    if (!this.state.mapLoaded) return;
    if (this.state.showField) return;

    var row = Math.floor(y / this.state.cellSize);
    var col = Math.floor(x / this.state.cellSize);
    this.setState({ clickedCell: [row, col] });
  }

  handleMouseDown(event) {
    this.rect = this.refs.clickCanvas.getBoundingClientRect();
    var x = event.clientX - this.rect.left;
    var y = this.rect.bottom - event.clientY;
    var robotRadius = config.ROBOT_SIZE * this.state.pixelsPerMeter / 2;
    // if click is near robot, set isDown as true
    if (x < this.state.x + robotRadius && x > this.state.x - robotRadius &&
        y < this.state.y + robotRadius && y > this.state.y - robotRadius) {
      this.setState({ isRobotClicked: true });
    }
    else if (this.state.showField) {
      this.setState({ isUserDrawing: true });
      var row = Math.floor(y / this.state.cellSize);
      var col = Math.floor(x / this.state.cellSize);
      this.changeFieldCell(row, col);
    }
    else {
      this.onMapClick(x, y);
    }
  }

  handleMouseMove(event) {
    if (this.state.isRobotClicked) {
      var x = event.clientX - this.rect.left;
      var y = this.rect.bottom - event.clientY;
      this.setState({x: x, y: y});
    }
    else if (this.state.isUserDrawing) {
      var x = event.clientX - this.rect.left;
      var y = this.rect.bottom - event.clientY;
      var row = Math.floor(y / this.state.cellSize);
      var col = Math.floor(x / this.state.cellSize);
      this.changeFieldCell(row, col);
    }
  }

  handleMouseUp() {
    if (!this.state.isRobotClicked && !this.state.isUserDrawing) return;
    // this moves the robot along the path
    this.setState({isRobotClicked: false, isUserDrawing: false});
  }

  timer() {
    var length = this.state.path.length;
    if(length > this.i) {
      //move robot to the next spot
      this.findDirection();
      this.i = this.i + 1;
    }
    else {
      clearInterval(this.interval);
    }
  }

  findDirection(){
    var newCoord = [];
    newCoord = this.posToPixels(this.state.path[this.i][1], this.state.path[this.i][0]);
    if (newCoord[0] == this.state.x && newCoord[1] == this.state.y) return;
    this.setState({x: newCoord[0], y: newCoord[1]});
  }

  onGoalClear() {
    this.setState({clickedCell: [],
                    goalCell: []});
  }

  setGoal(goal) {
    if (goal.length === 0) return false;

    var idx = goal[1] + goal[0] * this.state.width;
    var valid = this.state.cells[idx] < 0.5;

    this.setState({goalCell: goal, goalValid: valid});

    return valid;
  }

  onPlan() {
    // If goal isn't valid, don't plan.
    if (!this.setGoal(this.state.clickedCell)) return;
    // Clear visted canvas
    var start_row = Math.floor(this.state.y / this.state.cellSize);
    var start_col = Math.floor(this.state.x / this.state.cellSize);
    var plan_data = {type: "plan",
                      data: {
                        map_name: this.state.mapfile.name,
                        goal: "[" + this.state.clickedCell[0] + " " + this.state.clickedCell[1] + "]",
                        start: "[" + start_row + " " + start_col + "]"
                      }
                    };
  }

  onFieldCheck() {
    if (!this.state.showField) {
      this.refs.fieldCanvas.style.display = 'block';
    }
    else {
      this.refs.fieldCanvas.style.display = 'none';
    }

    this.setState({showField: !this.state.showField, drawFieldIncrease: false});
  }

  onIncreaseCheck() {
    this.setState({drawFieldIncrease: !this.state.drawFieldIncrease});
  }

  drawField(cells) {
    if (cells.length !== this.fieldGrid.width * this.fieldGrid.height) {
      return;
    }

    this.fieldGrid.clear();
    for (var i = 0; i < this.fieldGrid.width; i++) {
      for (var j = 0; j < this.fieldGrid.height; j++) {
        var idx = this.fieldGrid.getCellIdx(i, j);
        if (this.state.cells[idx] > config.COLLISION_THRESHOLD) continue;

        var prob = cells[idx];
        var color = getColor(prob, config.FIELD_COLOUR_LOW, config.FIELD_COLOUR_HIGH);
        this.fieldGrid.drawCell([j, i], this.fieldGrid.cellSize, color);
      }
    }
  }

  changeFieldCell(row, col) {
    // var idx = this.fieldGrid.getCellIdx(col, row);
    // if (this.state.cells[idx] > config.COLLISION_THRESHOLD) return;

    for (var i = row - config.PAINTBRUSH_RADIUS; i < row + config.PAINTBRUSH_RADIUS; i++) {
      for (var j = col - config.PAINTBRUSH_RADIUS; j < col + config.PAINTBRUSH_RADIUS; j++) {
        if (Math.pow(i - row, 2) + Math.pow(j - col, 2) > Math.pow(config.PAINTBRUSH_RADIUS, 2)) continue;

        var idx = this.fieldGrid.getCellIdx(j, i);
        if (idx < 0 || idx >= this.state.num_cells) continue;
        if (this.state.cells[idx] > config.COLLISION_THRESHOLD) continue;

        if (!this.state.drawFieldIncrease) {
          this.field[idx] = Math.max(this.field[idx] - config.PAINT_CELL_DELTA, 0);
        }
        else {
          this.field[idx] = Math.min(this.field[idx] + config.PAINT_CELL_DELTA, 1);
        }

        var color = getColor(this.field[idx], config.FIELD_COLOUR_LOW, config.FIELD_COLOUR_HIGH);
        this.fieldGrid.drawCell([i, j], this.fieldGrid.cellSize, color);
      }
    }
    // if (!this.state.drawFieldIncrease) {
    //   this.field[idx] = Math.max(this.field[idx] - config.PAINT_CELL_DELTA, 0);
    // }
    // else {
    //   this.field[idx] = Math.min(this.field[idx] + config.PAINT_CELL_DELTA, 1);
    // }

    // var color = getColor(this.field[idx], config.FIELD_COLOUR_LOW, config.FIELD_COLOUR_HIGH);
    // this.fieldGrid.drawCell([row, col], this.fieldGrid.cellSize, color);
  }

  render() {
    var canvasStyle = {
      width: config.MAP_DISPLAY_WIDTH + "px",
      height: config.MAP_DISPLAY_WIDTH + "px",
    };

    return (
      <div>
        <div className="select-wrapper">
          <MapFileSelect onChange={(event) => this.onFileChange(event)}/>
        </div>

        <div className="button-wrapper">
          <button className="button" onClick={() => this.onFileUpload()}>Upload Map</button>
          <button className="button" onClick={() => this.onGoalClear()}>Clear Goal</button>
          <button className="button" onClick={() => this.onPlan()}>Start!</button>
        </div>

        <div className="status-wrapper">
          <div className="field-toggle-wrapper">
            Show Field:
            <label className="switch">
              <input type="checkbox" onClick={() => this.onFieldCheck()}/>
              <span className="slider round"></span>
            </label>
          </div>
          {this.state.showField &&
          <div className="field-toggle-wrapper">
            Increase Field:
            <label className="switch">
              <input type="checkbox" onClick={() => this.onIncreaseCheck()}/>
              <span className="slider round"></span>
            </label>
          </div>}
        </div>

        <div className="canvas-container" style={canvasStyle}>
          <DrawMap cells={this.state.cells} width={this.state.width} height={this.state.height} />
          <canvas ref="fieldCanvas" width={config.MAP_DISPLAY_WIDTH} height={config.MAP_DISPLAY_WIDTH}>
          </canvas>
          <DrawCells loaded={this.state.mapLoaded} path={this.state.path} clickedCell={this.state.clickedCell}
                      goalCell={this.state.goalCell} goalValid={this.state.goalValid}
                      cellSize={this.state.cellSize} />
          <DrawRobot x={this.state.x} y={this.state.y} theta={this.state.theta}
                      loaded={this.state.mapLoaded} pixelsPerMeter={this.state.pixelsPerMeter}
                      posToPixels={(x, y) => this.posToPixels(x, y)} />
          <canvas ref="clickCanvas" width={config.MAP_DISPLAY_WIDTH} height={config.MAP_DISPLAY_WIDTH}
                  onMouseDown={(e) => this.handleMouseDown(e)}
                  onMouseMove={(e) => this.handleMouseMove(e)}
                  onMouseUp={() => this.handleMouseUp()}>
          </canvas>
        </div>
      </div>
    );
  }
}

ReactDOM.render(
  <SceneView />,
  document.getElementById('app-root')
);
